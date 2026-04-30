"""
Signal & Intelligence API routes.

POST /api/signals/discover                        — trigger SignalIntelAgent run (async)
GET  /api/signals?company={domain}               — SignalReport for one domain
GET  /api/signals?client_id={uuid}               — all SignalReports for a client
POST /api/signals/{domain}/regenerate-intel       — regenerate intel report for one Tier 1 account
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.db.models import (
    ICPAccountRecord,
    MasterContextRecord,
    SignalIntelRunRecord,
    SignalReportRecord,
)
from backend.db.session import get_db
from backend.schemas.models import (
    AccountTier,
    AccountListMeta,
    ICPAccount,
    ICPAccountList,
    MasterContext,
    SignalReport,
    TierBreakdown,
)

router = APIRouter(prefix="/api/signals", tags=["signals"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class DiscoverRequest(BaseModel):
    client_id: str = Field(..., description="Client UUID to run signal discovery for")


class DiscoverResponse(BaseModel):
    job_id: str
    status: str = "queued"
    message: str


# ---------------------------------------------------------------------------
# Background task
# ---------------------------------------------------------------------------

async def _run_signal_intel(client_id: str, run_id: str, domain_filter: Optional[str] = None) -> None:
    from backend.agents.signal_intel.agent import SignalIntelAgent
    from backend.db.session import SessionLocal

    db = SessionLocal()
    try:
        mc_record = (
            db.query(MasterContextRecord)
            .filter(MasterContextRecord.client_id == client_id)
            .order_by(MasterContextRecord.created_at.desc())
            .first()
        )
        if not mc_record:
            _mark_run_failed(db, run_id, "No MasterContext found")
            return

        master_context = MasterContext.model_validate(mc_record.data)

        account_query = db.query(ICPAccountRecord).filter(
            ICPAccountRecord.client_id == client_id,
            ICPAccountRecord.is_removed == False,  # noqa: E712
        )
        if domain_filter:
            account_query = account_query.filter(ICPAccountRecord.domain == domain_filter)

        account_records = account_query.order_by(ICPAccountRecord.icp_score.desc()).all()

        if not account_records:
            _mark_run_failed(db, run_id, "No active ICP accounts found")
            return

        accounts = [ICPAccount.model_validate(r.data) for r in account_records]
        tier_1 = sum(1 for a in accounts if a.tier == AccountTier.TIER_1)
        tier_2 = sum(1 for a in accounts if a.tier == AccountTier.TIER_2)
        tier_3 = sum(1 for a in accounts if a.tier == AccountTier.TIER_3)

        account_list = ICPAccountList(
            accounts=accounts,
            meta=AccountListMeta(
                total_found=len(accounts),
                tier_breakdown=TierBreakdown(tier_1=tier_1, tier_2=tier_2, tier_3=tier_3),
                generated_at=datetime.now(tz=timezone.utc),
                client_id=uuid.UUID(client_id),
            ),
        )
    finally:
        db.close()

    agent = SignalIntelAgent()
    await agent.run(
        client_id=client_id,
        account_list=account_list,
        master_context=master_context,
        run_id=run_id,
    )


def _mark_run_failed(db: Session, run_id: str, reason: str) -> None:
    record = db.query(SignalIntelRunRecord).filter(SignalIntelRunRecord.id == run_id).first()
    if record:
        record.status = "failed"
        record.finished_at = datetime.now(tz=timezone.utc)
        record.quota_warnings = [{"error": reason}]
        db.commit()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/discover", response_model=DiscoverResponse, status_code=status.HTTP_202_ACCEPTED)
async def discover(
    body: DiscoverRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> DiscoverResponse:
    """Trigger a full signal + intelligence run for all approved accounts."""
    mc = (
        db.query(MasterContextRecord)
        .filter(MasterContextRecord.client_id == body.client_id)
        .first()
    )
    if not mc:
        raise HTTPException(
            status_code=404,
            detail=f"No MasterContext found for client_id={body.client_id!r}",
        )

    run_id = str(uuid.uuid4())
    run_record = SignalIntelRunRecord(
        id=run_id,
        client_id=body.client_id,
        started_at=datetime.now(tz=timezone.utc),
        status="running",
    )
    db.add(run_record)
    db.commit()

    background_tasks.add_task(_run_signal_intel, body.client_id, run_id)

    return DiscoverResponse(
        job_id=run_id,
        status="queued",
        message=(
            f"Signal & intelligence discovery queued for client_id={body.client_id}. "
            f"Track with job_id={run_id}."
        ),
    )


@router.get("")
def list_signals(
    client_id: Optional[str] = Query(None),
    company: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns signal reports filtered by client_id or company domain.

    - ?client_id={uuid}   → map of domain → SignalReport for all accounts
    - ?company={domain}   → single SignalReport for that domain
    """
    if not client_id and not company:
        raise HTTPException(status_code=400, detail="Provide either client_id or company.")

    if company:
        record = (
            db.query(SignalReportRecord)
            .filter(SignalReportRecord.account_domain == company)
            .order_by(SignalReportRecord.updated_at.desc())
            .first()
        )
        if not record:
            raise HTTPException(status_code=404, detail=f"No signal report found for domain={company!r}")
        return record.data

    # client_id path
    records = (
        db.query(SignalReportRecord)
        .filter(SignalReportRecord.client_id == client_id)
        .all()
    )
    if not records:
        raise HTTPException(
            status_code=404, detail=f"No signal reports found for client_id={client_id!r}"
        )

    return {r.account_domain: r.data for r in records}


@router.post("/{domain}/regenerate-intel", status_code=status.HTTP_202_ACCEPTED)
async def regenerate_intel(
    domain: str,
    background_tasks: BackgroundTasks,
    client_id: str = Query(..., description="Client UUID"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Regenerate the Account Intelligence Report for a single Tier 1 account.
    Operator override — ignores token budget for this one call.
    """
    # Verify the domain is TIER_1
    account_record = (
        db.query(ICPAccountRecord)
        .filter(
            ICPAccountRecord.client_id == client_id,
            ICPAccountRecord.domain == domain,
            ICPAccountRecord.is_removed == False,  # noqa: E712
        )
        .first()
    )
    if not account_record:
        raise HTTPException(status_code=404, detail=f"Account {domain!r} not found for client.")

    if account_record.tier != AccountTier.TIER_1.value:
        raise HTTPException(
            status_code=400,
            detail=f"Account {domain!r} is {account_record.tier} — intel reports are Tier 1 only.",
        )

    run_id = str(uuid.uuid4())
    run_record = SignalIntelRunRecord(
        id=run_id,
        client_id=client_id,
        started_at=datetime.now(tz=timezone.utc),
        status="running",
    )
    db.add(run_record)
    db.commit()

    background_tasks.add_task(_run_signal_intel, client_id, run_id, domain)

    return {
        "job_id": run_id,
        "status": "queued",
        "message": f"Intel regeneration queued for domain={domain}.",
    }
