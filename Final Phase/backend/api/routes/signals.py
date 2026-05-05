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
            demo = _demo_signal_report(company)
            if demo is None:
                raise HTTPException(status_code=404, detail=f"No signal report found for domain={company!r}")
            return demo
        return record.data

    # client_id path
    records = (
        db.query(SignalReportRecord)
        .filter(SignalReportRecord.client_id == client_id)
        .all()
    )
    if not records:
        return _demo_signal_reports()

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
        if _demo_signal_report(domain) is None:
            raise HTTPException(status_code=404, detail=f"Account {domain!r} not found for client.")
        return {
            "job_id": str(uuid.uuid4()),
            "status": "queued",
            "message": f"Demo intel regeneration queued for domain={domain}.",
        }

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


def _demo_signal(
    suffix: str,
    signal_type: str,
    intent_level: str,
    source: str,
    description: str,
    days_ago: int,
) -> Dict[str, Any]:
    detected = datetime.now(tz=timezone.utc)
    detected = detected.replace(day=max(1, detected.day - min(days_ago, detected.day - 1)))
    return {
        "signal_id": f"sig-{suffix}",
        "type": signal_type,
        "intent_level": intent_level,
        "description": description,
        "source": source,
        "source_url": f"https://example.com/signals/{suffix}",
        "detected_at": detected.isoformat(),
        "evidence_snippet": description,
    }


def _demo_signal_reports() -> Dict[str, Any]:
    reports = {
        "signal-1.example.com": {
            "account_domain": "signal-1.example.com",
            "tier": "TIER_1",
            "signals": [
                _demo_signal("1-funding", "FUNDING", "HIGH", "CRUNCHBASE", "Raised a $40M Series B and is expanding GTM capacity.", 10),
                _demo_signal("1-hiring", "RELEVANT_HIRE", "HIGH", "LINKEDIN_JOBS", "Hiring a VP Revenue Operations role.", 4),
                _demo_signal("1-news", "EXPANSION", "MEDIUM", "GOOGLE_NEWS", "Announced APAC expansion with new regional hires.", 18),
            ],
            "signal_score": {"high_count": 2, "medium_count": 1, "low_count": 0, "total_score": 26},
            "buying_stage": "READY_TO_BUY",
            "buying_stage_method": "RULES",
            "buying_stage_reasoning": "Multiple high-intent buying signals were detected in the last 30 days.",
            "recommended_outreach_approach": "Lead with the Series B growth mandate and offer a fast path to outbound pipeline lift.",
            "intel_report": {
                "company_snapshot": "[VERIFIED] Signal-1 Corp raised Series B funding and is scaling revenue operations.",
                "strategic_priorities": [
                    {
                        "priority": "Scale outbound pipeline with better account prioritization",
                        "evidence": "[VERIFIED] Hiring VP Revenue Operations.",
                        "evidence_status": "VERIFIED",
                        "source_url": "https://example.com/signals/1-hiring",
                    }
                ],
                "tech_stack": ["Salesforce", "HubSpot", "Outreach"],
                "competitive_landscape": [],
                "inferred_pain_points": [
                    {
                        "pain_point": "Manual prospecting and inconsistent account prioritization",
                        "evidence_status": "INFERRED",
                        "reasoning": "Revenue operations hiring and GTM expansion usually increase data quality pressure.",
                    }
                ],
                "recent_news": [],
                "buying_committee_summary": "Revenue leadership and RevOps are likely to drive evaluation.",
                "recommended_angle": "Connect ABM execution to the new revenue operations mandate.",
                "generated_by": {"researcher": "mock", "synthesizer": "mock"},
                "generated_at": datetime.now(tz=timezone.utc).isoformat(),
            },
        },
        "signal-2.example.com": {
            "account_domain": "signal-2.example.com",
            "tier": "TIER_1",
            "signals": [
                _demo_signal("2-cro", "LEADERSHIP_HIRE", "HIGH", "LINKEDIN_JOBS", "New CRO role detected.", 7),
                _demo_signal("2-sdr", "RELEVANT_HIRE", "MEDIUM", "LINKEDIN_JOBS", "Hiring SDRs for outbound team growth.", 12),
            ],
            "signal_score": {"high_count": 1, "medium_count": 1, "low_count": 0, "total_score": 14},
            "buying_stage": "EVALUATING",
            "buying_stage_method": "LLM_TIEBREAKER",
            "buying_stage_reasoning": "Leadership change plus SDR hiring suggests active GTM tooling evaluation.",
            "recommended_outreach_approach": "Offer a concrete benchmark and reference story for outbound scaling.",
            "intel_report": None,
        },
        "signal-3.example.com": {
            "account_domain": "signal-3.example.com",
            "tier": "TIER_2",
            "signals": [
                _demo_signal("3-funding", "FUNDING", "HIGH", "CRUNCHBASE", "Recently raised Series A.", 21),
            ],
            "signal_score": {"high_count": 1, "medium_count": 0, "low_count": 0, "total_score": 10},
            "buying_stage": "SOLUTION_AWARE",
            "buying_stage_method": "RULES",
            "buying_stage_reasoning": "One high-intent funding signal, but no active evaluation signal yet.",
            "recommended_outreach_approach": "Educate around the operating cost of manual account selection.",
            "intel_report": None,
        },
    }
    return reports


def _demo_signal_report(domain: str) -> Optional[Dict[str, Any]]:
    return _demo_signal_reports().get(domain)
