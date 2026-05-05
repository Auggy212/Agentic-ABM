"""
Copilot tool registry.

Two permission tiers (master prompt §7 + §3 — typed-confirmation friction is
the safety mechanism):

    read_only        — auto-executed by the backend; result fed back to the
                       LLM as a tool message.
    proposed_action  — NOT executed server-side. The backend returns the
                       proposed call in the response body. The frontend
                       renders it with a confirmation modal (typed for
                       irreversible actions). Operator must click Confirm
                       before any state change.

Adding a new tool: append a Tool entry below. The OpenAI-style schema is
generated from the dataclass fields by the helper.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Literal, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db.models import (
    CampaignHaltRecord,
    CP3MessageReviewRecord,
    CP3ReviewStateRecord,
    QuotaCounterRecord,
    SalesHandoffRecord,
)


Permission = Literal["read_only", "proposed_action"]


# ---------------------------------------------------------------------------
# Tool definition
# ---------------------------------------------------------------------------

@dataclass
class Tool:
    name: str
    description: str
    permission: Permission
    parameters: Dict[str, Any]              # JSON Schema (object) describing args
    handler: Optional[Callable[..., Any]] = None  # only for read_only tools
    required: List[str] = field(default_factory=list)
    # For proposed_action only: the typed-confirmation token, or None for a
    # plain confirm. Forwarded to the frontend so it knows which modal to use.
    confirm_token: Optional[str] = None
    # User-readable summary the frontend renders inside the confirm modal.
    consequence_template: str = ""

    def schema(self) -> Dict[str, Any]:
        """Render in OpenAI/Groq tool-use shape."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.parameters,
                    "required": self.required,
                },
            },
        }


# ---------------------------------------------------------------------------
# read_only handlers — return JSON-serialisable dicts
# ---------------------------------------------------------------------------

def _list_pending_messages(db: Session, *, client_id: str) -> Dict[str, Any]:
    state = db.query(CP3ReviewStateRecord).filter(CP3ReviewStateRecord.client_id == client_id).first()
    if state is None:
        return {"pending": [], "note": "No CP3 state for this client yet."}
    rows = (
        db.query(CP3MessageReviewRecord)
        .filter(CP3MessageReviewRecord.cp3_state_id == state.id, CP3MessageReviewRecord.review_decision == "PENDING")
        .limit(20)
        .all()
    )
    return {
        "client_id": client_id,
        "pending_count": len(rows),
        "first_20_ids": [r.message_id for r in rows],
    }


def _get_cp3_blockers(db: Session, *, client_id: str) -> Dict[str, Any]:
    state = db.query(CP3ReviewStateRecord).filter(CP3ReviewStateRecord.client_id == client_id).first()
    if state is None:
        return {"blockers": [], "note": "CP3 not started."}
    blockers = (state.data or {}).get("blockers", [])
    return {"client_id": client_id, "status": state.status, "blockers": blockers}


def _get_quota_status(db: Session) -> Dict[str, Any]:
    rows = db.query(QuotaCounterRecord).all()
    return {
        "quotas": [
            {
                "source": r.source,
                "window": r.window,
                "used": r.used,
                "limit": r.limit_value,
                "exhausted": r.used >= r.limit_value,
            }
            for r in rows
        ],
    }


def _list_overdue_handoffs(db: Session, *, client_id: str) -> Dict[str, Any]:
    rows = (
        db.query(SalesHandoffRecord)
        .filter(SalesHandoffRecord.client_id == client_id, SalesHandoffRecord.status == "PENDING")
        .all()
    )
    return {
        "client_id": client_id,
        "pending": [
            {"handoff_id": r.id, "account": r.account_domain, "score": r.engagement_score}
            for r in rows
        ],
    }


def _get_active_halts(db: Session, *, client_id: str) -> Dict[str, Any]:
    rows = (
        db.query(CampaignHaltRecord)
        .filter(CampaignHaltRecord.resumed_at.is_(None))
        .filter((CampaignHaltRecord.client_id == client_id) | (CampaignHaltRecord.scope == "GLOBAL"))
        .all()
    )
    return {
        "halts": [
            {"halt_id": r.id, "scope": r.scope, "reason": r.reason, "detail": r.detail}
            for r in rows
        ],
    }


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

REGISTRY: List[Tool] = [
    # ---- read_only ----
    Tool(
        name="list_pending_messages",
        description="List up to 20 CP3 messages still pending operator review for the given client.",
        permission="read_only",
        parameters={"client_id": {"type": "string", "description": "Active client UUID."}},
        required=["client_id"],
        handler=_list_pending_messages,
    ),
    Tool(
        name="get_cp3_blockers",
        description="Return the current CP3 status and blocker list for the given client.",
        permission="read_only",
        parameters={"client_id": {"type": "string"}},
        required=["client_id"],
        handler=_get_cp3_blockers,
    ),
    Tool(
        name="get_quota_status",
        description="Return per-source quota usage. Use when the user asks about API limits.",
        permission="read_only",
        parameters={},
        required=[],
        handler=_get_quota_status,
    ),
    Tool(
        name="list_overdue_handoffs",
        description="List CP4 handoffs in PENDING status for the given client.",
        permission="read_only",
        parameters={"client_id": {"type": "string"}},
        required=["client_id"],
        handler=_list_overdue_handoffs,
    ),
    Tool(
        name="get_active_halts",
        description="List active campaign halts (client-scoped + global) for the given client.",
        permission="read_only",
        parameters={"client_id": {"type": "string"}},
        required=["client_id"],
        handler=_get_active_halts,
    ),
    # ---- proposed_action — frontend confirmation REQUIRED ----
    Tool(
        name="navigate",
        description="Suggest navigating the operator to a different page. Safe; no state change.",
        permission="proposed_action",
        parameters={"path": {"type": "string", "description": "React Router pathname, e.g. /checkpoint-3"}},
        required=["path"],
        confirm_token=None,
        consequence_template="Open the {path} page.",
    ),
    Tool(
        name="notify_handoff",
        description="Notify the Sales Exec for a CP4 handoff (sets notify_sent_at, starts SLA clock).",
        permission="proposed_action",
        parameters={"handoff_id": {"type": "string"}},
        required=["handoff_id"],
        confirm_token=None,
        consequence_template="Start the 24h Sales Exec SLA clock for handoff {handoff_id}.",
    ),
    Tool(
        name="accept_handoff",
        description="Accept a CP4 handoff on behalf of the Sales Exec. Irreversible.",
        permission="proposed_action",
        parameters={
            "handoff_id": {"type": "string"},
            "accepted_by": {"type": "string", "description": "Email of the accepting operator."},
        },
        required=["handoff_id", "accepted_by"],
        confirm_token="ACCEPT",
        consequence_template="Mark handoff {handoff_id} as ACCEPTED by {accepted_by}. Cannot be undone.",
    ),
    Tool(
        name="halt_campaign",
        description="Halt the active campaign for the given client. Pauses all outbound sends.",
        permission="proposed_action",
        parameters={
            "client_id": {"type": "string"},
            "detail": {"type": "string", "description": "Reason for the halt (audit log)."},
        },
        required=["client_id", "detail"],
        confirm_token="HALT",
        consequence_template="Halt campaign for client {client_id}. Reason: {detail}.",
    ),
]


# ---------------------------------------------------------------------------
# Helpers consumed by the route
# ---------------------------------------------------------------------------

def tool_schemas() -> List[Dict[str, Any]]:
    """List of tool schemas for Groq's tools= argument."""
    return [t.schema() for t in REGISTRY]


def get_tool(name: str) -> Optional[Tool]:
    return next((t for t in REGISTRY if t.name == name), None)


def execute_read_only(tool: Tool, db: Session, args: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a read_only tool. Raises ValueError on misuse."""
    if tool.permission != "read_only":
        raise ValueError(f"{tool.name} is not read_only — must go through proposed_action flow")
    if tool.handler is None:
        raise ValueError(f"{tool.name} has no handler registered")
    # Filter args to declared parameters; ignore anything extra the model invented.
    declared = set(tool.parameters.keys())
    filtered = {k: v for k, v in args.items() if k in declared}
    return tool.handler(db, **filtered)


def build_proposed_action(tool: Tool, args: Dict[str, Any]) -> Dict[str, Any]:
    """Render a proposed_action payload for the frontend."""
    if tool.permission != "proposed_action":
        raise ValueError(f"{tool.name} is not a proposed_action tool")
    declared = set(tool.parameters.keys())
    safe_args = {k: v for k, v in args.items() if k in declared}
    consequence = tool.consequence_template
    for k, v in safe_args.items():
        consequence = consequence.replace("{" + k + "}", str(v))
    return {
        "tool": tool.name,
        "args": safe_args,
        "confirm_token": tool.confirm_token,  # null = simple confirm; "RESUME"/"HALT"/"ACCEPT" = typed
        "consequence": consequence,
    }
