from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.agents.cp3 import state_manager
from backend.agents.cp3.state_manager import CP3NotFoundError, CP3StateError
from backend.db.models import CP3ReviewStateRecord, MessageRecord
from backend.db.session import get_db
from backend.schemas.models import CP3ReviewState, CP3Status

router = APIRouter(prefix="/api/client-review", tags=["client-review"])

_RATE_LIMIT: dict[str, list[datetime]] = defaultdict(list)


class FeedbackRequest(BaseModel):
    message_id: Optional[str] = None
    feedback_text: str
    sentiment: str


class ClientApproveRequest(BaseModel):
    signature_name: str


def _load_state(share_token: str, db: Session) -> tuple[CP3ReviewStateRecord, CP3ReviewState]:
    record = db.query(CP3ReviewStateRecord).filter(CP3ReviewStateRecord.client_share_token == share_token).first()
    if record is None:
        raise HTTPException(status_code=404, detail="Invalid review link")
    state = CP3ReviewState.model_validate(record.data)
    if state.status != CP3Status.CLIENT_REVIEW:
        raise HTTPException(status_code=410, detail="This review is closed")
    return record, state


def _check_rate_limit(share_token: str) -> None:
    now = datetime.now(tz=timezone.utc)
    window = now - timedelta(hours=1)
    _RATE_LIMIT[share_token] = [ts for ts in _RATE_LIMIT[share_token] if ts > window]
    if len(_RATE_LIMIT[share_token]) >= 50:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    _RATE_LIMIT[share_token].append(now)


@router.get("/{share_token}")
def get_client_review(share_token: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    _, state = _load_state(share_token, db)
    sample_ids = {str(mid) for mid in state.client_review_sample_ids}
    rows = db.query(MessageRecord).filter(MessageRecord.id.in_(sample_ids)).all() if sample_ids else []
    messages = []
    for row in rows:
        data = row.data
        messages.append({
            "message_id": data["message_id"],
            "account_domain": data["account_domain"],
            "contact_id": data.get("contact_id"),
            "channel": data["channel"],
            "sequence_position": data["sequence_position"],
            "subject": data.get("subject"),
            "body": data["body"],
        })
    return {
        "client_id": str(state.client_id),
        "status": state.status.value,
        "messages": messages,
        "aggregate_progress": {
            "total_messages": state.aggregate_progress.total_messages,
            "reviewed_messages": state.aggregate_progress.reviewed_messages,
            "client_feedback_total": state.aggregate_progress.client_feedback_total,
            "client_feedback_unresolved": state.aggregate_progress.client_feedback_unresolved,
        },
        "client_feedback": [feedback.model_dump(mode="json") for feedback in state.client_feedback],
        "submission_status": "signed" if state.client_completed_at else "open",
    }


@router.post("/{share_token}/feedback")
def post_feedback(share_token: str, body: FeedbackRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    _load_state(share_token, db)
    _check_rate_limit(share_token)
    try:
        feedback = state_manager.submit_client_feedback(share_token, body.model_dump(), db)
    except (CP3NotFoundError, CP3StateError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return feedback.model_dump(mode="json")


@router.post("/{share_token}/approve")
def post_approve(share_token: str, body: ClientApproveRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    if not body.signature_name.strip():
        raise HTTPException(status_code=422, detail="signature_name is required")
    _load_state(share_token, db)
    try:
        state = state_manager.client_approve(share_token, body.signature_name, db)
    except CP3StateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return state.model_dump(mode="json")
