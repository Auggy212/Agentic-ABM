"""
Checkpoint 2 review API routes.

GET    /api/checkpoint-2?client_id={id}                  - lazily open + return state
PATCH  /api/checkpoint-2/claims/{claim_id}               - per-claim review action
POST   /api/checkpoint-2/accounts/{domain}/approve       - bulk approve buyers + account
POST   /api/checkpoint-2/accounts/{domain}/remove        - remove account from pipeline
POST   /api/checkpoint-2/approve                         - approve CP2 (gates Phase 4)
POST   /api/checkpoint-2/reject                          - reject CP2 (needs-revision)
GET    /api/checkpoint-2/audit?client_id={id}            - full audit log
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.agents.cp2 import state_manager
from backend.agents.cp2.state_manager import (
    CP2NotFoundError,
    CP2StateError,
)
from backend.db.session import get_db
from backend.schemas.models import ReviewDecision

router = APIRouter(prefix="/api/checkpoint-2", tags=["checkpoint-2"])


DEFAULT_REVIEWER = "ops@sennen.io"


class ReviewClaimRequest(BaseModel):
    decision: ReviewDecision
    corrected_text: Optional[str] = None
    review_notes: Optional[str] = None
    reviewer: str = Field(default=DEFAULT_REVIEWER)


class ApproveAccountRequest(BaseModel):
    account_notes: Optional[str] = None
    reviewer: str = Field(default=DEFAULT_REVIEWER)


class RemoveAccountRequest(BaseModel):
    reason: str = Field(..., min_length=1)
    reviewer: str = Field(default=DEFAULT_REVIEWER)


class ApproveCP2Request(BaseModel):
    reviewer_notes: Optional[str] = None
    reviewer: str = Field(default=DEFAULT_REVIEWER)


class RejectCP2Request(BaseModel):
    reason: str = Field(..., min_length=1)
    reviewer: str = Field(default=DEFAULT_REVIEWER)


def _state_response(state) -> Dict[str, Any]:
    return state.model_dump(mode="json")


@router.get("")
def get_review(
    client_id: str = Query(..., description="Client UUID"),
    reviewer: str = Query(DEFAULT_REVIEWER, description="Reviewer identity"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        state = state_manager.get_state(client_id, db)
    except CP2NotFoundError:
        try:
            state = state_manager.open_review(client_id, reviewer, db)
        except CP2StateError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _state_response(state)


@router.patch("/claims/{claim_id}")
def patch_claim(
    claim_id: str,
    body: ReviewClaimRequest,
    client_id: str = Query(..., description="Client UUID"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        state = state_manager.review_claim(
            client_id=client_id,
            claim_id=claim_id,
            decision=body.decision,
            reviewer=body.reviewer,
            corrected_text=body.corrected_text,
            review_notes=body.review_notes,
            db=db,
        )
    except CP2NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CP2StateError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _state_response(state)


@router.post("/accounts/{account_domain}/approve")
def post_approve_account(
    account_domain: str,
    body: ApproveAccountRequest,
    client_id: str = Query(..., description="Client UUID"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        state = state_manager.approve_account(
            client_id=client_id,
            account_domain=account_domain,
            reviewer=body.reviewer,
            account_notes=body.account_notes,
            db=db,
        )
    except CP2NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CP2StateError as exc:
        # 409 = "blocked because claims still pending"
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _state_response(state)


@router.post("/accounts/{account_domain}/remove")
def post_remove_account(
    account_domain: str,
    body: RemoveAccountRequest,
    client_id: str = Query(..., description="Client UUID"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        state = state_manager.remove_account(
            client_id=client_id,
            account_domain=account_domain,
            reviewer=body.reviewer,
            reason=body.reason,
            db=db,
        )
    except CP2NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _state_response(state)


@router.post("/approve")
def post_approve(
    body: ApproveCP2Request,
    client_id: str = Query(..., description="Client UUID"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        state = state_manager.approve_cp2(
            client_id=client_id,
            reviewer=body.reviewer,
            reviewer_notes=body.reviewer_notes,
            db=db,
        )
    except CP2NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CP2StateError as exc:
        # 409 with the current state body so the UI can render blockers immediately
        try:
            current = state_manager.get_state(client_id, db)
            payload = {"detail": str(exc), "state": _state_response(current)}
        except CP2NotFoundError:
            payload = {"detail": str(exc)}
        raise HTTPException(status_code=409, detail=payload) from exc
    return _state_response(state)


@router.post("/reject")
def post_reject(
    body: RejectCP2Request,
    client_id: str = Query(..., description="Client UUID"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    try:
        state = state_manager.reject_cp2(
            client_id=client_id,
            reviewer=body.reviewer,
            reason=body.reason,
            db=db,
        )
    except CP2NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _state_response(state)


@router.get("/audit")
def get_audit(
    client_id: str = Query(..., description="Client UUID"),
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    return state_manager.get_audit_log(client_id, db)
