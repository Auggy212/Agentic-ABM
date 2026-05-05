from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.agents.cp2.gate import CP2NotApprovedError
from backend.agents.storyteller.agent import StorytellerAgent
from backend.db.models import MessageRecord, MessagingRunRecord
from backend.db.session import get_db

router = APIRouter(prefix="/api/storyteller", tags=["storyteller"])


class GenerateRequest(BaseModel):
    client_id: str
    scope: Literal["all"] | Dict[str, Any] = "all"


class RegenerateRequest(BaseModel):
    reason: str = Field(..., min_length=1)
    override_template_id: Optional[str] = None


@router.post("/generate")
def generate(body: GenerateRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        package = StorytellerAgent(db).run(body.client_id, body.scope)
    except CP2NotApprovedError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc
    return {
        "job_id": "sync-local-run",
        "status": "COMPLETED",
        "package": package.model_dump(mode="json"),
    }


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
    return {"client_id": client_id, "messages": [row.data for row in rows]}


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
