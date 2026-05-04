from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.agents.cp3 import state_manager
from backend.agents.cp3.state_manager import CP3NotFoundError, CP3StateError
from backend.db.session import get_db
from backend.schemas.models import MessageReviewDecision

router = APIRouter(prefix="/api/checkpoint-3", tags=["checkpoint-3"])
DEFAULT_REVIEWER = "ops@sennen.io"


class ReviewMessageRequest(BaseModel):
    decision: MessageReviewDecision
    edits: Optional[list[dict[str, Any]]] = None
    review_notes: Optional[str] = None
    reviewer: str = DEFAULT_REVIEWER


class BuyerApproveRequest(BaseModel):
    buyer_notes: Optional[str] = None
    reviewer: str = DEFAULT_REVIEWER


class OperatorCompleteRequest(BaseModel):
    reviewer_notes: Optional[str] = None
    reviewer: str = DEFAULT_REVIEWER


class SendToClientRequest(BaseModel):
    client_email: str
    sample_message_ids: list[str] = Field(..., min_length=1, max_length=5)


class ResolveFeedbackRequest(BaseModel):
    resolution_notes: str
    reviewer: str = DEFAULT_REVIEWER


class ApproveCP3Request(BaseModel):
    reviewer_notes: Optional[str] = None
    reviewer: str = DEFAULT_REVIEWER


class RejectCP3Request(BaseModel):
    reason: str
    reviewer: str = DEFAULT_REVIEWER


@router.get("")
def get_cp3(client_id: str = Query(...), reviewer: str = Query(DEFAULT_REVIEWER), db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        state = state_manager.get_state(client_id, db)
    except CP3NotFoundError:
        state = state_manager.open_review(client_id, reviewer, db)
    return state.model_dump(mode="json")


@router.patch("/messages/{message_id}")
def patch_message(message_id: str, body: ReviewMessageRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        review = state_manager.review_message(message_id, body.decision, body.reviewer, db, edits=body.edits, review_notes=body.review_notes)
    except CP3NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CP3StateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return review.model_dump(mode="json")


@router.post("/messages/{message_id}/opened")
def opened(message_id: str, db: Session = Depends(get_db)) -> Dict[str, int]:
    try:
        return {"opened_count": state_manager.increment_opened(message_id, db)}
    except CP3NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/buyers/{contact_id}/approve")
def approve_buyer(contact_id: str, body: BuyerApproveRequest, client_id: str = Query(...), db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        buyer = state_manager.approve_buyer(client_id, contact_id, body.reviewer, db, buyer_notes=body.buyer_notes)
    except CP3NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CP3StateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return buyer.model_dump(mode="json")


@router.post("/operator-complete")
def operator_complete(body: OperatorCompleteRequest, client_id: str = Query(...), db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        state = state_manager.mark_operator_complete(client_id, body.reviewer, db)
    except CP3StateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return state.model_dump(mode="json")


@router.post("/send-to-client")
def send_to_client(body: SendToClientRequest, client_id: str = Query(...), db: Session = Depends(get_db)) -> Dict[str, str]:
    try:
        return state_manager.send_to_client(client_id, body.client_email, body.sample_message_ids, db)
    except CP3StateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/feedback/{feedback_id}/resolve")
def resolve_feedback(feedback_id: str, body: ResolveFeedbackRequest, client_id: str = Query(...), db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        feedback = state_manager.resolve_feedback(client_id, feedback_id, body.resolution_notes, body.reviewer, db)
    except CP3NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return feedback.model_dump(mode="json")


@router.post("/approve")
def approve_cp3(body: ApproveCP3Request, client_id: str = Query(...), db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        state = state_manager.approve_cp3(client_id, body.reviewer_notes, body.reviewer, db)
    except CP3StateError as exc:
        current = state_manager.get_state(client_id, db)
        raise HTTPException(status_code=409, detail={"message": str(exc), "blockers": [b.model_dump(mode="json") for b in current.blockers]}) from exc
    return state.model_dump(mode="json")


@router.post("/reject")
def reject_cp3(body: RejectCP3Request, client_id: str = Query(...), db: Session = Depends(get_db)) -> Dict[str, Any]:
    state = state_manager.get_state(client_id, db)
    record = state_manager._record(db, client_id)  # internal helper; route keeps reject simple for Phase 4
    updated = state.model_copy(update={"status": "REJECTED", "reviewer": body.reviewer})
    return state_manager._persist(db, record, updated).model_dump(mode="json")
