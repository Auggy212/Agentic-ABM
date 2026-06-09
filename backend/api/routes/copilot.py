"""
Copilot — RAG-powered chatbot backed by Claude Sonnet.

Architecture:
  1. Retrieve relevant app data via hybrid keyword + vector search (RAG).
  2. Load the last N conversation turns from the DB (persistent memory).
  3. Build a system prompt that includes page context + retrieved knowledge.
  4. Run the Anthropic tool-use loop (read_only tools auto-executed; proposed
     actions returned to the frontend for operator confirmation).
  5. Persist both the user turn and the assistant reply to the DB.

The bot is automatically "trained" on all app data — every time an agent run
completes it indexes its output into rag_index, and the copilot picks it up
on the next query with zero configuration.
"""

import json
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.agents.copilot.retriever import format_context_block, retrieve
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
    CopilotConversationRecord,
    CP2ReviewStateRecord,
    CP3ReviewStateRecord,
    ICPAccountRecord,
    MessageRecord,
    SalesHandoffRecord,
)
from backend.db.session import get_db

router = APIRouter(prefix="/api/copilot", tags=["copilot"])

# Rolling conversation window injected into each request
CONVERSATION_WINDOW = 20
# Tool-use iterations before giving up
MAX_TOOL_ITERATIONS = 5
# Groq model
_MODEL = "llama-3.3-70b-versatile"


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class PageContext(BaseModel):
    route: Optional[str] = Field(None)
    client_id: Optional[str] = Field(None)
    selection_ids: Optional[List[str]] = Field(None)


class CopilotMessage(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    page: Optional[PageContext] = Field(None)
    context: Optional[Dict[str, Any]] = None


class ProposedAction(BaseModel):
    tool: str
    args: Dict[str, Any]
    confirm_token: Optional[str] = None
    consequence: str


class CopilotResponse(BaseModel):
    text: str
    trace: Optional[List[Dict[str, Any]]] = None
    cards: Optional[List[Dict[str, Any]]] = None
    proposed_actions: List[ProposedAction] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Page context builder (unchanged from original)
# ---------------------------------------------------------------------------

def _build_page_context(db: Session, page: Optional[PageContext]) -> Dict[str, Any]:
    ctx: Dict[str, Any] = {
        "route": page.route if page else None,
        "selection_ids": page.selection_ids if page and page.selection_ids else [],
    }
    account_count = db.query(func.count(ICPAccountRecord.id)).filter(
        ICPAccountRecord.is_removed == False  # noqa: E712
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


_ROUTE_HINTS: Dict[str, str] = {
    "/checkpoint-2": "User is reviewing inferred claims. Per-item approve/correct/remove is required; bulk cannot approve [INFERRED] claims.",
    "/checkpoint-3": "User is reviewing generated messages. Each must be opened (opened_count >= 1) before buyer-level approval. CP3 must be APPROVED before /campaigns can run.",
    "/checkpoint-4": "User is processing Sales Handoff queue. Notify must be sent before Accept/Reject. Overdue PENDING rows can be bulk-escalated (typed ESCALATE).",
    "/campaigns": "User is on the Campaign dashboard. New runs require CP3 APPROVED and no active halt. Resume requires typing RESUME exactly (case-sensitive).",
    "/sales/handoff/": "External Sales Exec view — DO NOT reveal internal terminology, IDs, costs, or model names.",
    "/client-review/": "External Client review — sanitized message samples only; no validation badges or cost data.",
}

_BASE_SYSTEM = (
    "You are the operator copilot for the ABM Engine — a multi-agent ABM pipeline with four "
    "human-in-the-loop checkpoints (CP1 accounts, CP2 inferred claims, CP3 messages, CP4 sales "
    "handoff). You have access to the full history of what the pipeline has produced for this client.\n\n"
    "Rules:\n"
    "- Be concise, concrete, and respect gate rules.\n"
    "- Never instruct the user to bypass a checkpoint or the campaign halt RESUME friction.\n"
    "- If the user asks about data (accounts, buyers, signals, messages), answer from the "
    "KNOWLEDGE BASE CONTEXT below — do not fabricate.\n"
    "- If a fact is not in the knowledge base or page context, say you do not know.\n"
    "- When proposing actions, present them clearly and wait for confirmation."
)


def _build_system_prompt(page_ctx: Dict[str, Any], rag_context: str) -> str:
    route = page_ctx.get("route") or "(unknown)"
    hint = ""
    for prefix, text in _ROUTE_HINTS.items():
        if route.startswith(prefix):
            hint = f"\nRoute hint: {text}"
            break
    context_block = "\n".join(f"- {k}: {v}" for k, v in page_ctx.items() if v not in (None, [], {}))

    return (
        f"{_BASE_SYSTEM}\n\n"
        f"CURRENT PAGE CONTEXT:\n{context_block or '- (none)'}\n{hint}\n\n"
        f"KNOWLEDGE BASE (retrieved from app data — top relevant records):\n{rag_context}"
    )


# ---------------------------------------------------------------------------
# Conversation memory helpers
# ---------------------------------------------------------------------------

def _load_history(db: Session, client_id: str) -> List[Dict[str, Any]]:
    """Load the last CONVERSATION_WINDOW turns for this client."""
    if not client_id:
        return []
    rows = (
        db.query(CopilotConversationRecord)
        .filter(CopilotConversationRecord.client_id == client_id)
        .order_by(CopilotConversationRecord.created_at.desc())
        .limit(CONVERSATION_WINDOW)
        .all()
    )
    # Reverse so oldest-first for the LLM
    return [{"role": r.role, "content": r.content} for r in reversed(rows)]


def _persist_turn(db: Session, client_id: str, role: str, content: str) -> None:
    if not client_id:
        return
    db.add(CopilotConversationRecord(client_id=client_id, role=role, content=content))
    db.commit()


# ---------------------------------------------------------------------------
# Groq tool-use loop
# ---------------------------------------------------------------------------

def _ensure_api_key() -> None:
    if not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=503, detail="Copilot unavailable: GROQ_API_KEY not configured.")


def run_tool_loop(
    db: Session,
    user_message: str,
    page_ctx: Dict[str, Any],
    history: List[Dict[str, Any]],
    rag_context: str,
) -> Dict[str, Any]:
    """
    Groq tool-use loop (llama-3.3-70b-versatile).
    Returns: { "text": str, "trace": [...], "proposed_actions": [...] }
    """
    from backend.services.groq_client import GroqClient

    _ensure_api_key()
    client = GroqClient()
    system = _build_system_prompt(page_ctx, rag_context)

    messages: List[Dict[str, Any]] = [{"role": "system", "content": system}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    trace: List[Dict[str, Any]] = []
    proposed: List[Dict[str, Any]] = []
    text_response = ""

    for _ in range(MAX_TOOL_ITERATIONS):
        try:
            msg = client.chat_message(
                messages=messages,
                model=_MODEL,
                temperature=0.4,
                max_tokens=512,
                tools=tool_schemas(),
            )
        except RuntimeError as exc:
            trace.append({"text": f"Tool turn failed ({exc}); retrying without tools", "done": True})
            try:
                msg = client.chat_message(
                    messages=messages, model=_MODEL, temperature=0.4, max_tokens=512,
                )
                text_response = msg.content or ""
            except RuntimeError as exc2:
                text_response = f"I hit an LLM error ({exc2}). Please try rephrasing."
            break

        tool_calls = getattr(msg, "tool_calls", None) or []
        if not tool_calls:
            text_response = msg.content or ""
            break

        messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
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
                messages.append({"role": "tool", "tool_call_id": tc.id, "name": name,
                                  "content": json.dumps({"error": "unknown tool"})})
                continue

            if tool.permission == "read_only":
                try:
                    result = execute_read_only(tool, db, args)
                except Exception as exc:
                    result = {"error": str(exc)}
                trace.append({"text": f"Tool: {name}({json.dumps(args)})", "done": True})
                messages.append({"role": "tool", "tool_call_id": tc.id, "name": name,
                                  "content": json.dumps(result)})
            else:
                proposal = build_proposed_action(tool, args)
                proposed.append(proposal)
                any_proposed = True
                trace.append({"text": f"Proposed: {name} (operator confirmation required)", "done": True})
                messages.append({"role": "tool", "tool_call_id": tc.id, "name": name,
                                  "content": json.dumps({"status": "awaiting_operator_confirmation"})})

        if any_proposed:
            try:
                msg = client.chat_message(
                    messages=messages, model=_MODEL, temperature=0.4, max_tokens=256,
                )
                text_response = msg.content or ""
            except RuntimeError as exc:
                trace.append({"text": f"Final turn failed: {exc}", "done": True})
                text_response = (
                    "I prepared the action" + ("s" if len(proposed) != 1 else "") + " below for your confirmation."
                )
            break

    return {"text": text_response or "(no response)", "trace": trace, "proposed_actions": proposed}


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/context")
def get_copilot_context(db: Session = Depends(get_db)) -> Dict[str, Any]:
    account_count = db.query(func.count(ICPAccountRecord.id)).filter(
        ICPAccountRecord.is_removed == False  # noqa: E712
    ).scalar() or 0
    sequence_count = db.query(func.count(MessageRecord.id)).scalar() or 0

    return {
        "greeting": "Welcome back! Let's supercharge your outreach.",
        "chips": [
            "Which accounts have the strongest buying signals?",
            "Show me buyer profiles for my top accounts",
            "What messages are pending review?",
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
    page_ctx = _build_page_context(db, body.page)
    client_id = body.page.client_id if body.page else None
    route_label = page_ctx.get("route") or "global"

    # 1. RAG retrieval
    rag_rows = []
    if client_id:
        try:
            rag_rows = retrieve(db, client_id, body.message)
        except Exception:
            pass
    rag_context = format_context_block(rag_rows)

    # 2. Conversation history
    history = _load_history(db, client_id) if client_id else []

    # 3. Persist user turn
    if client_id:
        _persist_turn(db, client_id, "user", body.message)

    head_trace: List[Dict[str, Any]] = [
        {"text": f"Loading context for {route_label}", "done": True},
        {"text": f"Retrieved {len(rag_rows)} knowledge base records", "done": True},
        {"text": f"Loaded {len(history)} conversation turns", "done": True},
    ]
    if page_ctx.get("cp3_status"):
        head_trace.append({"text": f"CP3 status: {page_ctx['cp3_status']}", "done": True})
    if page_ctx.get("campaign_halt"):
        head_trace.append({"text": f"Halt active ({page_ctx['campaign_halt']['reason']})", "done": True})

    result = run_tool_loop(db, body.message, page_ctx, history, rag_context)

    # 4. Persist assistant reply
    if client_id and result["text"]:
        _persist_turn(db, client_id, "assistant", result["text"])

    trace = head_trace + result["trace"] + [{"text": f"Groq · {_MODEL}", "done": True}]

    return CopilotResponse(
        text=result["text"],
        trace=trace,
        proposed_actions=[ProposedAction(**p) for p in result["proposed_actions"]],
    )


@router.post("/message/stream")
def stream_copilot_message(
    body: CopilotMessage,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """SSE streaming endpoint — no tool use, one-shot text."""
    _ensure_api_key()

    page_ctx = _build_page_context(db, body.page)
    client_id = body.page.client_id if body.page else None

    rag_rows = []
    if client_id:
        try:
            rag_rows = retrieve(db, client_id, body.message)
        except Exception:
            pass

    history = _load_history(db, client_id) if client_id else []
    if client_id:
        _persist_turn(db, client_id, "user", body.message)

    system = _build_system_prompt(page_ctx, format_context_block(rag_rows))
    messages = [{"role": "system", "content": system}] + list(history) + [{"role": "user", "content": body.message}]

    def event_iter():
        from backend.services.groq_client import GroqClient
        groq = GroqClient()
        full_text: List[str] = []
        try:
            for delta in groq.chat_stream(messages=messages, model=_MODEL, temperature=0.4, max_tokens=512):
                full_text.append(delta)
                yield f"data: {json.dumps({'type': 'text', 'delta': delta})}\n\n"
            if client_id and full_text:
                _persist_turn(db, client_id, "assistant", "".join(full_text))
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except RuntimeError as exc:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(exc)})}\n\n"

    return StreamingResponse(event_iter(), media_type="text/event-stream")


@router.delete("/history/{client_id}")
def clear_history(client_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Clear conversation history for a client (useful for testing)."""
    deleted = (
        db.query(CopilotConversationRecord)
        .filter(CopilotConversationRecord.client_id == client_id)
        .delete()
    )
    db.commit()
    return {"deleted": deleted}


@router.post("/index/{client_id}")
def trigger_reindex(client_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Manually trigger a full RAG re-index for a client."""
    from backend.agents.copilot.rag_indexer import index_client
    counts = index_client(db, client_id)
    return {"client_id": client_id, "indexed": counts}


# ---------------------------------------------------------------------------
# Action execution (unchanged)
# ---------------------------------------------------------------------------

class ConfirmActionRequest(BaseModel):
    tool: str
    args: Dict[str, Any] = Field(default_factory=dict)
    confirmation: Optional[str] = Field(None)
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
