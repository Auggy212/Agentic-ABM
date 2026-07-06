from __future__ import annotations

import logging
import threading
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.agents.cp2.gate import CP2NotApprovedError
from backend.agents.storyteller.agent import StorytellerAgent, StorytellerBudgetError
from backend.db.models import BuyerProfileRecord, MessageRecord, MessagingRunRecord
from backend.db.session import SessionLocal, get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/storyteller", tags=["storyteller"])


class GenerateRequest(BaseModel):
    client_id: str
    scope: Literal["all"] | Dict[str, Any] = "all"


class RegenerateRequest(BaseModel):
    reason: str = Field(..., min_length=1)
    override_template_id: Optional[str] = None


def _run_in_background(client_id: str, scope: Any) -> None:
    db = SessionLocal()
    try:
        package = StorytellerAgent(db).run(client_id, scope)
        try:
            from backend.agents.copilot.rag_indexer import post_run_index
            post_run_index(db, client_id, ["messages"])
        except Exception:
            pass
    except Exception:
        logger.exception("StorytellerAgent background run failed for client_id=%s", client_id)
    finally:
        db.close()


@router.post("/generate")
def generate(body: GenerateRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    # Gate check — must be synchronous so we can return 423 before spawning the thread
    from backend.agents.cp2.gate import assert_cp2_approved
    try:
        assert_cp2_approved(body.client_id, db)
    except CP2NotApprovedError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc

    try:
        StorytellerAgent(db)  # validates budget env vars before spawning
    except StorytellerBudgetError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc

    thread = threading.Thread(
        target=_run_in_background,
        args=(body.client_id, body.scope),
        daemon=True,
    )
    thread.start()

    return {"job_id": "background", "status": "RUNNING"}


@router.get("/messages")
def get_messages(
    client_id: str = Query(...),
    account_domain: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    query = db.query(MessageRecord).filter(MessageRecord.client_id == client_id)
    if account_domain:
        query = query.filter(MessageRecord.account_domain == account_domain)
    rows = query.order_by(MessageRecord.account_domain.asc(), MessageRecord.sequence_position.asc()).all()

    messages = [dict(row.data) for row in rows]

    # Enrich messages that are missing contact_name/contact_title from buyer profiles
    contact_ids = list({m["contact_id"] for m in messages if m.get("contact_id") and not m.get("contact_name")})
    if contact_ids:
        profiles = (
            db.query(BuyerProfileRecord)
            .filter(
                BuyerProfileRecord.client_id == client_id,
                BuyerProfileRecord.contact_id.in_(contact_ids),
            )
            .all()
        )
        profile_map = {}
        for p in profiles:
            d = p.data or {}
            full_name = d.get("full_name") or (f"{d.get('first_name', '')} {d.get('last_name', '')}".strip())
            profile_map[str(p.contact_id)] = {
                "contact_name": full_name or None,
                "contact_title": d.get("current_title") or d.get("title") or "",
                "contact_committee_role": d.get("committee_role") or d.get("contact_committee_role") or "",
                "account_company": d.get("company_name") or d.get("account_company") or "",
            }
        for m in messages:
            cid = str(m.get("contact_id") or "")
            if cid in profile_map and not m.get("contact_name"):
                m.update(profile_map[cid])

    return {"client_id": client_id, "messages": messages}


@router.get("/message/{message_id}")
def get_message(message_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    row = db.query(MessageRecord).filter(MessageRecord.id == message_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return row.data


@router.post("/message/{message_id}/regenerate")
def regenerate_message(
    message_id: str,
    body: RegenerateRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    row = db.query(MessageRecord).filter(MessageRecord.id == message_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Message not found")
    data = dict(row.data)
    data["review_state"] = "REQUIRES_REGENERATION"
    data.setdefault("operator_edit_history", []).append(
        {
            "edited_at": data.get("last_updated_at"),
            "edited_by": "ops@sennen.io",
            "before": data.get("body", ""),
            "after": data.get("body", ""),
            "reason": f"Regeneration requested: {body.reason}",
        }
    )
    row.review_state = "REQUIRES_REGENERATION"
    row.data = data
    db.add(row)
    db.commit()
    return data


@router.get("/run/{run_id}")
def get_run(run_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    row = db.query(MessagingRunRecord).filter(MessagingRunRecord.id == run_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "id": row.id,
        "client_id": row.client_id,
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "finished_at": row.finished_at.isoformat() if row.finished_at else None,
        "total_messages": row.total_messages,
        "hard_failures": row.hard_failures,
        "soft_failures": row.soft_failures,
        "total_cost_usd": row.total_cost_usd,
        "claude_cost_usd": row.claude_cost_usd,
        "gpt_cost_usd": row.gpt_cost_usd,
        "status": row.status,
        "data": row.data,
    }

