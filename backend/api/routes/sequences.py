"""
Sequences endpoint — returns MessageRecords grouped by account_domain as sequences,
with full step data, and supports PATCH for status toggles and step body edits.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.db.models import MessageRecord
from backend.db.session import get_db

router = APIRouter(prefix="/api/sequences", tags=["sequences"])

# Channel name → frontend SequenceStep channel type
_CHANNEL_MAP: Dict[str, str] = {
    "EMAIL": "email",
    "LINKEDIN_DM": "linkedin",
    "WHATSAPP": "call",
    "SMS": "call",
}


def _make_step(msg: MessageRecord) -> Dict[str, Any]:
    data: Dict[str, Any] = msg.data or {}
    channel_key = _CHANNEL_MAP.get(msg.channel.upper(), "email")
    subject: Optional[str] = data.get("subject")
    body: str = data.get("body") or ""

    # Build a readable title: "Subject" for email, channel label otherwise
    if subject:
        title = subject
    else:
        title = f"{msg.channel.replace('_', ' ').title()} — touch {msg.sequence_position}"

    return {
        "id": msg.id,
        "day": msg.sequence_position,
        "channel": channel_key,
        "title": title,
        "body": body,
        "tier": msg.tier,
        "contact_id": msg.contact_id,
        "review_state": msg.review_state,
        "stats": {},  # real engagement stats require webhook ingestion
    }


@router.get("")
def get_sequences(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Get all sequences (grouped by account_domain) with KPIs and real step data.
    """
    sequences_list: List[Dict[str, Any]] = []

    domains = db.query(MessageRecord.account_domain).distinct().all()

    for (domain,) in domains:
        messages = (
            db.query(MessageRecord)
            .filter(MessageRecord.account_domain == domain)
            .order_by(MessageRecord.sequence_position)
            .all()
        )

        if not messages:
            continue

        contacts = {m.contact_id for m in messages if m.contact_id}
        steps = [_make_step(m) for m in messages]

        # Derive status: if any message is in a terminal review state, treat as active
        has_approved = any(m.review_state in ("APPROVED", "EDITED") for m in messages)
        status = "active" if has_approved else "draft"

        sequences_list.append({
            "id": domain,
            "name": domain,
            "description": f"Personalised outreach sequence for {domain} — {len(messages)} messages across {len(contacts) or 1} contact(s)",
            "status": status,
            "accounts": 1,
            "contacts": len(contacts) or 1,
            "metrics": {
                "sent": len(messages),
                "opened": 0,
                "replied": 0,
                "meetings": 0,
            },
            "steps": steps,
        })

    total_messages = db.query(func.count(MessageRecord.id)).scalar() or 0
    total_contacts = db.query(func.count(MessageRecord.contact_id.distinct())).scalar() or 0
    total_domains = len(sequences_list)

    kpis = [
        {"label": "Messages Drafted", "num": str(total_messages), "delta": ""},
        {"label": "Contacts Covered", "num": str(total_contacts), "delta": ""},
        {"label": "Active Sequences",  "num": str(total_domains), "delta": ""},
        {"label": "Avg Steps / Seq",
         "num": str(round(total_messages / total_domains, 1)) if total_domains else "0",
         "delta": ""},
    ]

    return {
        "sequences": sequences_list,
        "kpis": kpis,
    }


# ── PATCH: toggle sequence status (active ↔ paused) ──────────────────────────

class SequenceStatusPatch(BaseModel):
    status: str  # "active" | "paused"


@router.patch("/{domain}/status")
def patch_sequence_status(
    domain: str,
    body: SequenceStatusPatch,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Toggle the sequence status for all messages in a domain."""
    if body.status not in ("active", "paused"):
        raise HTTPException(status_code=422, detail="status must be 'active' or 'paused'")

    messages = db.query(MessageRecord).filter(MessageRecord.account_domain == domain).all()
    if not messages:
        raise HTTPException(status_code=404, detail="Sequence not found")

    # We store pause state on the review_state field when paused
    for msg in messages:
        if body.status == "paused" and msg.review_state not in ("PAUSED",):
            msg.review_state = "PAUSED"
        elif body.status == "active" and msg.review_state == "PAUSED":
            msg.review_state = "APPROVED"  # restore to approved

    db.commit()
    return {"domain": domain, "status": body.status}


# ── PATCH: edit a single step's body ─────────────────────────────────────────

class StepBodyPatch(BaseModel):
    body: str
    subject: Optional[str] = None


@router.patch("/steps/{message_id}")
def patch_step_body(
    message_id: str,
    body: StepBodyPatch,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Update the body (and optionally subject) of a single outreach message step."""
    msg = db.query(MessageRecord).filter(MessageRecord.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    data = dict(msg.data or {})
    data["body"] = body.body
    if body.subject is not None:
        data["subject"] = body.subject
    msg.data = data
    db.commit()

    return {"id": message_id, "body": body.body, "subject": data.get("subject")}
