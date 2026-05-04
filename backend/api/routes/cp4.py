from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.agents.cp4 import state_manager
from backend.agents.cp4.gate import CP4NotAcceptedError, assert_cp4_accepted
from backend.agents.cp4.state_manager import CP4NotFoundError, CP4StateError
from backend.db.session import get_db
from backend.schemas.models import CP4Status

router = APIRouter(prefix="/api/checkpoint-4", tags=["checkpoint-4"])
DEFAULT_REVIEWER = "sales@sennen.io"


class AcceptHandoffRequest(BaseModel):
    accepted_by: str = Field(..., min_length=1)


class RejectHandoffRequest(BaseModel):
    rejection_reason: str = Field(..., min_length=1)
    rejected_by: str = Field(..., min_length=1)


class EscalateSweepRequest(BaseModel):
    actor: str = "scheduler"


class GateCheckRequest(BaseModel):
    handoff_id: str


@router.get("")
def list_handoffs(
    client_id: str = Query(...),
    status: Optional[CP4Status] = Query(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    notes = state_manager.list_handoffs(client_id, db, status=status)
    overview = state_manager.summary(client_id, db)
    return {
        "summary": overview.model_dump(mode="json"),
        "handoffs": [n.model_dump(mode="json") for n in notes],
    }


@router.get("/{handoff_id}")
def get_handoff(handoff_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        note = state_manager.get_handoff(handoff_id, db)
    except CP4NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return note.model_dump(mode="json")


@router.post("/{handoff_id}/accept")
def accept(handoff_id: str, body: AcceptHandoffRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        note = state_manager.accept_handoff(handoff_id, body.accepted_by, db)
    except CP4NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CP4StateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return note.model_dump(mode="json")


@router.post("/{handoff_id}/reject")
def reject(handoff_id: str, body: RejectHandoffRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        note = state_manager.reject_handoff(handoff_id, body.rejection_reason, body.rejected_by, db)
    except CP4NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CP4StateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return note.model_dump(mode="json")


@router.post("/{handoff_id}/notify")
def notify(handoff_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        note = state_manager.notify_sales_exec(handoff_id, db)
    except CP4NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CP4StateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return note.model_dump(mode="json")


@router.post("/escalate-overdue")
def escalate_overdue(
    body: EscalateSweepRequest,
    client_id: str = Query(...),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    escalated = state_manager.escalate_overdue(client_id, db, actor=body.actor)
    return {"escalated_count": len(escalated), "handoffs": [n.model_dump(mode="json") for n in escalated]}


@router.post("/gate/check")
def gate_check(body: GateCheckRequest, db: Session = Depends(get_db)) -> Dict[str, str]:
    """Mirror of the Phase 5 gate. Returns 423 (Locked) when the handoff is not ACCEPTED."""
    try:
        assert_cp4_accepted(body.handoff_id, db)
    except CP4NotAcceptedError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc
    return {"status": "ACCEPTED"}
