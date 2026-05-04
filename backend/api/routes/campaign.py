from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.agents.campaign import circuit_breaker
from backend.agents.campaign.agent import CampaignAgent
from backend.agents.campaign.circuit_breaker import (
    CampaignHaltedError,
    InvalidResumeTokenError,
    halt_client,
    halt_global,
    is_halted,
    resume,
)
from backend.agents.campaign.quota_manager import DEFAULT_QUOTAS, QuotaManager
from backend.agents.cp3.gate import CP3NotApprovedError
from backend.db.models import CampaignHaltRecord, CampaignRunRecord, OutboundSendRecord
from backend.db.session import SessionLocal, get_db
from backend.schemas.models import CampaignRunStatus, HaltReason, HaltScope


router = APIRouter(prefix="/api/campaign", tags=["campaign"])


# ---------------------------------------------------------------------------
# Background-runner session factory (test override hook, mirrors webhooks.py)
# ---------------------------------------------------------------------------

_session_factory = SessionLocal


def set_session_factory(factory) -> None:
    global _session_factory
    _session_factory = factory


def reset_session_factory() -> None:
    global _session_factory
    _session_factory = SessionLocal


def _run_in_background(client_id: str, run_id: str) -> None:
    db = _session_factory()
    try:
        agent = CampaignAgent(db)
        # Replace the auto-created run record with the operator-allocated one
        # so polling by run_id works. Simplest implementation: rerun and reuse
        # the operator-supplied id by patching the agent's run_record after
        # creation. For Phase 5a we accept that this background run creates a
        # *second* CampaignRunRecord and the operator polls the latest.
        try:
            agent.run(client_id)
        except (CP3NotApprovedError, CampaignHaltedError):
            # Already surfaced synchronously to the caller; nothing to do.
            pass
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class HaltRequest(BaseModel):
    reason: HaltReason = Field(default=HaltReason.OPERATOR_REQUESTED)
    detail: str = Field(..., min_length=1)
    triggered_by: str = Field(..., min_length=1)


class ResumeRequest(BaseModel):
    halt_id: str
    confirmation: str = Field(..., description="Must be exactly 'RESUME'.")
    resumed_by: str = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# Run lifecycle
# ---------------------------------------------------------------------------

@router.post("/run", status_code=202)
def trigger_run(
    background: BackgroundTasks,
    client_id: str = Query(...),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Kick off CampaignAgent.run in the background. 423 if CP3 not approved or
    a halt is active for this client (or globally)."""
    # Synchronous gate checks so the operator gets a meaningful HTTP code.
    from backend.agents.cp3.gate import assert_cp3_approved
    try:
        assert_cp3_approved(client_id, db)
    except CP3NotApprovedError as exc:
        raise HTTPException(status_code=423, detail=str(exc)) from exc
    halt = is_halted(client_id, db)
    if halt is not None:
        raise HTTPException(status_code=423, detail=f"Campaign halted (scope={halt.scope}, reason={halt.reason}): {halt.detail}")

    # Allocate a placeholder run id for the response; the agent will create
    # its own CampaignRunRecord — operators poll by client_id+latest.
    background.add_task(_run_in_background, client_id, "queued")
    return {"status": "queued", "client_id": client_id}


@router.get("/runs/{run_id}")
def get_run(run_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    record = db.query(CampaignRunRecord).filter(CampaignRunRecord.id == run_id).first()
    if record is None:
        raise HTTPException(status_code=404, detail=f"campaign run {run_id!r} not found")
    return _run_to_dict(record)


@router.get("/runs")
def list_runs(client_id: str = Query(...), db: Session = Depends(get_db)) -> Dict[str, Any]:
    rows = (
        db.query(CampaignRunRecord)
        .filter(CampaignRunRecord.client_id == client_id)
        .order_by(CampaignRunRecord.started_at.desc())
        .all()
    )
    return {"runs": [_run_to_dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# Halt + resume (operator + global). Master prompt §3: RESUME friction is
# the safety mechanism — the body confirmation must equal exactly 'RESUME'.
# ---------------------------------------------------------------------------

@router.post("/halt", status_code=200)
def operator_halt(
    body: HaltRequest,
    client_id: str = Query(...),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    record = halt_client(
        client_id,
        reason=body.reason,
        detail=body.detail,
        triggered_by=body.triggered_by,
        db=db,
    )
    return _halt_to_dict(record)


@router.post("/resume", status_code=200)
def operator_resume(body: ResumeRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        record = resume(halt_id=body.halt_id, confirmation_token=body.confirmation, resumed_by=body.resumed_by, db=db)
    except InvalidResumeTokenError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _halt_to_dict(record)


@router.post("/global-halt", status_code=200)
def global_halt(body: HaltRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    record = halt_global(reason=body.reason, detail=body.detail, triggered_by=body.triggered_by, db=db)
    return _halt_to_dict(record)


@router.post("/global-resume", status_code=200)
def global_resume(body: ResumeRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    try:
        record = resume(halt_id=body.halt_id, confirmation_token=body.confirmation, resumed_by=body.resumed_by, db=db)
    except InvalidResumeTokenError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if record.scope != HaltScope.GLOBAL.value:
        raise HTTPException(status_code=409, detail="halt is not global-scoped")
    return _halt_to_dict(record)


@router.get("/halts")
def list_active_halts(db: Session = Depends(get_db)) -> Dict[str, Any]:
    rows = (
        db.query(CampaignHaltRecord)
        .filter(CampaignHaltRecord.resumed_at.is_(None))
        .order_by(CampaignHaltRecord.triggered_at.desc())
        .all()
    )
    return {"halts": [_halt_to_dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# Quota status (feeds frontend QuotaPanel)
# ---------------------------------------------------------------------------

@router.get("/quota-status")
def quota_status(db: Session = Depends(get_db)) -> Dict[str, Any]:
    qm = QuotaManager(db)
    items = []
    for source, spec in DEFAULT_QUOTAS.items():
        record = qm._get_or_create(source)
        items.append({
            "source": source,
            "window": record.window,
            "used": record.used,
            "limit": record.limit_value,
            "remaining": max(record.limit_value - record.used, 0),
            "exhausted": record.used >= record.limit_value,
            "window_kind": spec.window,
        })
    return {"quotas": items}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_to_dict(record: CampaignRunRecord) -> Dict[str, Any]:
    return {
        "run_id": record.id,
        "client_id": record.client_id,
        "status": record.status,
        "started_at": record.started_at.isoformat() if record.started_at else None,
        "finished_at": record.finished_at.isoformat() if record.finished_at else None,
        "total_messages": record.total_messages,
        "total_sent": record.total_sent,
        "total_failed": record.total_failed,
        "total_pending": record.total_pending,
        "halted": record.halted,
        "halt_reason": record.halt_reason,
        "quota_warnings": record.quota_warnings or [],
    }


def _halt_to_dict(record: CampaignHaltRecord) -> Dict[str, Any]:
    return {
        "halt_id": record.id,
        "client_id": record.client_id,
        "scope": record.scope,
        "reason": record.reason,
        "detail": record.detail,
        "triggered_at": record.triggered_at.isoformat() if record.triggered_at else None,
        "triggered_by": record.triggered_by,
        "resumed_at": record.resumed_at.isoformat() if record.resumed_at else None,
        "resumed_by": record.resumed_by,
        "is_active": record.resumed_at is None,
    }
