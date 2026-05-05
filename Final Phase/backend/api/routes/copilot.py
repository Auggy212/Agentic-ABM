"""
Copilot context and message endpoint.
"""

import json
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.agents.copilot.tools import (
    REGISTRY,
    build_proposed_action,
    execute_read_only,
    get_tool,
    tool_schemas,
)
from backend.db.models import (
    CampaignHaltRecord,
    CampaignRunRecord,
    CP2ReviewStateRecord,
    CP3ReviewStateRecord,
    ICPAccountRecord,
    MessageRecord,
    SalesHandoffRecord,
)
from backend.db.session import get_db

router = APIRouter(prefix="/api/copilot", tags=["copilot"])


class PageContext(BaseModel):
    """Where the operator is in the UI when they sent the message.

    Frontend sends this on every /message POST; the backend uses it to load
    the relevant CP2/CP3/halt/handoff state and feed it into the system prompt.
    """
    route: Optional[str] = Field(None, description="React Router pathname, e.g. '/checkpoint-3'.")
    client_id: Optional[str] = Field(None, description="Active client_id if the page is scoped to one.")
    selection_ids: Optional[List[str]] = Field(None, description="IDs the user has selected (messages, accounts, etc.).")


class CopilotMessage(BaseModel):
    """User message to Copilot."""
    message: str = Field(..., min_length=1, max_length=2000)
    page: Optional[PageContext] = Field(None, description="UI context — route, client_id, selection.")
    # Legacy free-form context kept for backward compatibility.
    context: Optional[Dict[str, Any]] = None


class ProposedAction(BaseModel):
    tool: str
    args: Dict[str, Any]
    confirm_token: Optional[str] = None  # null = simple confirm; otherwise typed
    consequence: str


class CopilotResponse(BaseModel):
    """Copilot response."""
    text: str
    trace: Optional[List[Dict[str, Any]]] = None
    cards: Optional[List[Dict[str, Any]]] = None
    proposed_actions: List[ProposedAction] = Field(default_factory=list)


# Maximum tool-call iterations before we give up and return whatever the model
# said. Bounded both for cost and to prevent runaway loops.
MAX_TOOL_ITERATIONS = 3


# ---------------------------------------------------------------------------
# Page context loader. Pulls real workspace state so the LLM can answer
# "what should I do next" rather than guessing.
# ---------------------------------------------------------------------------

def _build_page_context(db: Session, page: Optional[PageContext]) -> Dict[str, Any]:
    """
    Returns a small dict describing what the user can see right now. The dict
    is rendered into the system prompt verbatim — keep it short and factual.
    Avoid any field that could leak across clients.
    """
    ctx: Dict[str, Any] = {
        "route": page.route if page else None,
        "selection_ids": page.selection_ids if page and page.selection_ids else [],
    }

    account_count = db.query(func.count(ICPAccountRecord.id)).filter(
        ICPAccountRecord.is_removed == False  # noqa: E712 (SQL false)
    ).scalar() or 0
    ctx["accounts_active"] = int(account_count)

    client_id = page.client_id if page else None

    if client_id:
        cp2 = db.query(CP2ReviewStateRecord).filter(CP2ReviewStateRecord.client_id == client_id).first()
        if cp2:
            ctx["cp2_status"] = cp2.status
        cp3 = db.query(CP3ReviewStateRecord).filter(CP3ReviewStateRecord.client_id == client_id).first()
        if cp3:
            ctx["cp3_status"] = cp3.status

        active_halt = (
            db.query(CampaignHaltRecord)
            .filter(CampaignHaltRecord.resumed_at.is_(None))
            .filter((CampaignHaltRecord.client_id == client_id) | (CampaignHaltRecord.scope == "GLOBAL"))
            .first()
        )
        if active_halt:
            ctx["campaign_halt"] = {"scope": active_halt.scope, "reason": active_halt.reason}

        latest_run = (
            db.query(CampaignRunRecord)
            .filter(CampaignRunRecord.client_id == client_id)
            .order_by(CampaignRunRecord.started_at.desc())
            .first()
        )
        if latest_run:
            ctx["latest_run"] = {
                "status": latest_run.status,
                "sent": latest_run.total_sent,
                "failed": latest_run.total_failed,
                "pending": latest_run.total_pending,
            }

        cp4_pending = db.query(func.count(SalesHandoffRecord.id)).filter(
            SalesHandoffRecord.client_id == client_id, SalesHandoffRecord.status == "PENDING"
        ).scalar() or 0
        ctx["cp4_pending_handoffs"] = int(cp4_pending)

    return ctx


# Per-route hint text. The model is good at next-step suggestions but it does
# not know the gate semantics — these one-liners disambiguate.
_ROUTE_HINTS: Dict[str, str] = {
    "/checkpoint-2": "User is reviewing inferred claims. Per-item approve/correct/remove is required; bulk cannot approve [INFERRED] claims.",
    "/checkpoint-3": "User is reviewing generated messages. Each must be opened (opened_count >= 1) before buyer-level approval. CP3 must be APPROVED before /campaigns can run.",
    "/checkpoint-4": "User is processing Sales Handoff queue. Notify must be sent before Accept/Reject. Overdue PENDING rows can be bulk-escalated (typed ESCALATE).",
    "/campaigns": "User is on the Campaign dashboard. New runs require CP3 APPROVED and no active halt. Resume requires typing RESUME exactly (case-sensitive).",
    "/sales/handoff/": "External Sales Exec view — DO NOT reveal internal terminology, IDs, costs, or model names.",
    "/client-review/": "External Client review — sanitized message samples only; no validation badges or cost data.",
}

_SYSTEM_PROMPT = (
    "You are the operator copilot for the ABM Engine — a multi-agent ABM pipeline with four "
    "human-in-the-loop checkpoints (CP1 accounts, CP2 inferred claims, CP3 messages, CP4 sales "
    "handoff). Be concise, concrete, and respect the gate rules. Never instruct the user to bypass "
    "a checkpoint or the campaign halt RESUME friction. If the user is stuck, give them the next "
    "single action they can take from where they are now. Do not invent data — if a fact is not in "
    "the page-context block below, say you do not know."
)


def _build_system_prompt(page_ctx: Dict[str, Any]) -> str:
    route = page_ctx.get("route") or "(unknown)"
    hint = ""
    for prefix, text in _ROUTE_HINTS.items():
        if route.startswith(prefix):
            hint = f"\nRoute hint: {text}"
            break
    context_block = "\n".join(f"- {k}: {v}" for k, v in page_ctx.items() if v not in (None, [], {}))
    return f"{_SYSTEM_PROMPT}\n\nCurrent page context:\n{context_block or '- (none)'}\n{hint}"


def _ensure_api_key() -> None:
    if not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=503, detail="Copilot unavailable: GROQ_API_KEY not configured.")


def run_tool_loop(
    db: Session,
    user_message: str,
    page_ctx: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Iterative tool-use loop. Returns:
        { "text": str, "trace": [...], "proposed_actions": [...] }

    read_only tool calls are auto-executed and the result is fed back to Groq.
    proposed_action tool calls are NOT executed — they are appended to
    proposed_actions for the frontend to render with a confirmation modal.
    Loop ends when the model returns a content message OR after MAX iterations.
    """
    from backend.services.groq_client import GroqClient

    _ensure_api_key()
    client = GroqClient()
    system = _build_system_prompt(page_ctx)

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_message},
    ]
    trace: List[Dict[str, Any]] = []
    proposed: List[Dict[str, Any]] = []
    text_response = ""

    for _ in range(MAX_TOOL_ITERATIONS):
        try:
            msg = client.chat_message(
                messages=messages,
                model="llama-3.3-70b-versatile",
                temperature=0.4,
                max_tokens=512,
                tools=tool_schemas(),
            )
        except RuntimeError as exc:
            # Most common cause: Groq's `tool_use_failed` (the model emitted a
            # malformed function call as plain text). Retry the same prompt
            # WITHOUT tools so we at least get a useful free-text reply.
            trace.append({"text": f"Tool turn failed ({exc}); retrying without tools", "done": True})
            try:
                msg = client.chat_message(
                    messages=messages,
                    model="llama-3.3-70b-versatile",
                    temperature=0.4,
                    max_tokens=512,
                )
                text_response = msg.content or ""
            except RuntimeError as exc2:
                text_response = f"I hit an LLM error ({exc2}). Please try rephrasing."
            break

        # Append the assistant message back to the convo for the next turn.
        # Groq's tool_calls have role=assistant + tool_calls list.
        tool_calls = getattr(msg, "tool_calls", None) or []
        if not tool_calls:
            text_response = msg.content or ""
            break

        # Echo the assistant's tool-call message so the next round can see it.
        messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in tool_calls
            ],
        })

        any_proposed = False
        for tc in tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            tool = get_tool(name)
            if tool is None:
                trace.append({"text": f"Model invoked unknown tool {name!r}", "done": True})
                messages.append({
                    "role": "tool", "tool_call_id": tc.id,
                    "name": name, "content": json.dumps({"error": "unknown tool"}),
                })
                continue

            if tool.permission == "read_only":
                try:
                    result = execute_read_only(tool, db, args)
                except Exception as exc:  # tool errors become tool messages, not 500s
                    result = {"error": str(exc)}
                trace.append({"text": f"Tool: {name}({json.dumps(args)})", "done": True})
                messages.append({
                    "role": "tool", "tool_call_id": tc.id,
                    "name": name, "content": json.dumps(result),
                })
            else:
                # proposed_action — return to the frontend for confirmation.
                proposal = build_proposed_action(tool, args)
                proposed.append(proposal)
                any_proposed = True
                trace.append({"text": f"Proposed: {name} (operator confirmation required)", "done": True})
                # Reply to the model with a synthetic tool result so it can
                # phrase the proposal naturally. Don't say "executed" — we
                # haven't.
                messages.append({
                    "role": "tool", "tool_call_id": tc.id, "name": name,
                    "content": json.dumps({"status": "awaiting_operator_confirmation"}),
                })

        if any_proposed:
            # If we proposed at least one action, ask the model for a final
            # message and stop. Crucially, do NOT pass tools on this turn —
            # llama-3.3-70b on Groq sometimes still emits a malformed
            # function-call string when `tools` is present even with
            # tool_choice="none", which Groq rejects with 400 tool_use_failed.
            try:
                msg = client.chat_message(
                    messages=messages,
                    model="llama-3.3-70b-versatile",
                    temperature=0.4,
                    max_tokens=256,
                )
                text_response = msg.content or ""
            except RuntimeError as exc:
                # Final turn failed — fall back to a templated summary of the
                # proposals so the operator still gets something to act on.
                trace.append({"text": f"Final turn failed: {exc}", "done": True})
                text_response = (
                    "I prepared the action"
                    + ("s" if len(proposed) != 1 else "")
                    + " below for your confirmation."
                )
            break

    return {"text": text_response or "(no response)", "trace": trace, "proposed_actions": proposed}


@router.get("/context")
def get_copilot_context(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get context for Copilot initialization.
    
    Returns:
    - greeting: welcome message
    - chips: quick action chips
    - initial_cards: suggested cards
    - account_count: total active accounts
    - sequence_count: total sequences
    - agent_run_label: status of agents
    """
    # Get counts from database
    account_count = db.query(func.count(ICPAccountRecord.id)).filter(
        ICPAccountRecord.is_removed == False
    ).scalar() or 0
    
    sequence_count = db.query(func.count(MessageRecord.id)).scalar() or 0
    
    return {
        "greeting": "Welcome back! Let's supercharge your outreach.",
        "chips": [
            "Find high-intent accounts",
            "Review buyer profiles",
            "Generate outreach messages",
            "Track campaign performance",
        ],
        "initial_cards": [
            {
                "title": "Get started with Phase 1",
                "body": "Upload a CSV of your target accounts to begin the discovery process.",
                "actions": ["Upload CSV", "Learn more"],
            },
            {
                "title": "Quick wins",
                "body": "Check out recent agent runs and their insights.",
                "actions": ["View agents"],
            },
        ],
        "account_count": account_count,
        "sequence_count": sequence_count,
        "agent_run_label": "all_idle",
    }


@router.post("/message")
def send_copilot_message(
    body: CopilotMessage,
    db: Session = Depends(get_db),
) -> CopilotResponse:
    """
    Send a message to Copilot and get an LLM-powered response.
    
    Uses Groq API for fast LLM inference.
    """
    page_ctx = _build_page_context(db, body.page)
    route_label = page_ctx.get("route") or "global"

    head_trace: List[Dict[str, Any]] = [
        {"text": f"Loading context for {route_label}", "done": True},
    ]
    if page_ctx.get("cp3_status"):
        head_trace.append({"text": f"CP3 status: {page_ctx['cp3_status']}", "done": True})
    if page_ctx.get("campaign_halt"):
        head_trace.append({"text": f"Halt active ({page_ctx['campaign_halt']['reason']})", "done": True})

    result = run_tool_loop(db, body.message, page_ctx)
    trace = head_trace + result["trace"] + [{"text": "Final answer (Groq · llama-3.3-70b)", "done": True}]

    return CopilotResponse(
        text=result["text"],
        trace=trace,
        proposed_actions=[ProposedAction(**p) for p in result["proposed_actions"]],
    )


# ---------------------------------------------------------------------------
# Streaming endpoint — SSE-style. Tool-use is disabled in streaming mode for
# now (one-shot text only); tool-loop callers should use /message instead.
# ---------------------------------------------------------------------------

@router.post("/message/stream")
def stream_copilot_message(
    body: CopilotMessage,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    _ensure_api_key()
    page_ctx = _build_page_context(db, body.page)
    system = _build_system_prompt(page_ctx)
    user_msg = body.message

    def event_iter():
        from backend.services.groq_client import GroqClient
        client = GroqClient()
        try:
            for delta in client.chat_stream(
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_msg},
                ],
                model="llama-3.3-70b-versatile",
                temperature=0.4,
                max_tokens=512,
            ):
                yield f"data: {json.dumps({'type': 'text', 'delta': delta})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except RuntimeError as exc:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(exc)})}\n\n"

    return StreamingResponse(event_iter(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Action execution — operator confirmed a proposed_action. Server enforces
# the typed-confirmation friction again (defense in depth, master prompt §3).
# ---------------------------------------------------------------------------

class ConfirmActionRequest(BaseModel):
    tool: str
    args: Dict[str, Any] = Field(default_factory=dict)
    confirmation: Optional[str] = Field(None, description="Required when the tool's confirm_token is non-null; must equal it exactly.")
    actor: str = Field("ops@sennen.io", min_length=1)


class ConfirmActionResponse(BaseModel):
    tool: str
    status: str
    result: Dict[str, Any] = Field(default_factory=dict)


@router.post("/actions/execute")
def execute_proposed_action(
    body: ConfirmActionRequest,
    db: Session = Depends(get_db),
) -> ConfirmActionResponse:
    """
    Execute a proposed_action that the operator confirmed in the UI.

    Server-side guards (defense in depth — frontend has matching modal):
      - Tool must exist AND be a proposed_action
      - If tool.confirm_token is non-null, body.confirmation must equal it exactly
      - Tool args are filtered to declared parameters
    """
    tool = get_tool(body.tool)
    if tool is None:
        raise HTTPException(status_code=404, detail=f"unknown tool {body.tool!r}")
    if tool.permission != "proposed_action":
        raise HTTPException(status_code=400, detail=f"{body.tool!r} is not a proposed_action tool")
    if tool.confirm_token is not None and body.confirmation != tool.confirm_token:
        raise HTTPException(
            status_code=400,
            detail=f"confirmation token must be exactly {tool.confirm_token!r}",
        )

    declared = set(tool.parameters.keys())
    safe_args = {k: v for k, v in body.args.items() if k in declared}

    # Dispatch. Each branch is a thin shim to the existing state managers — the
    # tool registry is intentionally NOT a write API, just a typed router.
    if tool.name == "navigate":
        return ConfirmActionResponse(tool=tool.name, status="frontend_handled", result={"path": safe_args.get("path")})

    if tool.name == "notify_handoff":
        from backend.agents.cp4 import state_manager as cp4_state
        try:
            note = cp4_state.notify_sales_exec(safe_args["handoff_id"], db, actor=body.actor)
        except cp4_state.CP4NotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except cp4_state.CP4StateError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return ConfirmActionResponse(tool=tool.name, status="ok", result={"handoff_id": str(note.handoff_id)})

    if tool.name == "accept_handoff":
        from backend.agents.cp4 import state_manager as cp4_state
        try:
            note = cp4_state.accept_handoff(safe_args["handoff_id"], safe_args["accepted_by"], db)
        except cp4_state.CP4NotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except cp4_state.CP4StateError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return ConfirmActionResponse(tool=tool.name, status="ok", result={"handoff_id": str(note.handoff_id)})

    if tool.name == "halt_campaign":
        from backend.agents.campaign.circuit_breaker import halt_client
        from backend.schemas.models import HaltReason
        record = halt_client(
            safe_args["client_id"],
            reason=HaltReason.OPERATOR_REQUESTED,
            detail=safe_args["detail"],
            triggered_by=body.actor,
            db=db,
        )
        return ConfirmActionResponse(tool=tool.name, status="ok", result={"halt_id": record.id})

    raise HTTPException(status_code=501, detail=f"no executor wired for {tool.name!r}")

