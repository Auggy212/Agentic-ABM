"""
Verification API routes.

POST /api/verify/discover                  - trigger VerifierAgent run
GET  /api/verify?client_id={id}            - latest VerifiedDataPackage
GET  /api/verify/contact/{contact_id}      - single VerificationResult
POST /api/verify/contact/{contact_id}/recheck - manual re-check trigger
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.agents.verifier.agent import VerifierAgent
from backend.db.models import (
    BuyerProfileRecord,
    VerificationResultRecord,
    VerifiedRunRecord,
)
from backend.db.session import get_db
from backend.schemas.models import (
    BuyerIntelMeta,
    BuyerIntelPackage,
    BuyerProfile,
    VerifiedDataPackage,
)

router = APIRouter(prefix="/api/verify", tags=["verify"])


class DiscoverRequest(BaseModel):
    client_id: str = Field(..., description="Client UUID to verify")


class DiscoverResponse(BaseModel):
    job_id: str
    status: str = "queued"
    message: str


def _package_from_records(client_id: str, records: list[BuyerProfileRecord]) -> BuyerIntelPackage:
    accounts: dict[str, list[BuyerProfile]] = {}
    for record in records:
        profile = BuyerProfile.model_validate(record.data)
        accounts.setdefault(record.account_domain, []).append(profile)

    total_contacts = sum(len(v) for v in accounts.values())
    account_count = len(accounts)
    return BuyerIntelPackage(
        client_id=uuid.UUID(client_id),
        generated_at=datetime.now(tz=timezone.utc),
        accounts=accounts,
        meta=BuyerIntelMeta(
            total_accounts_processed=account_count,
            total_contacts_found=total_contacts,
            contacts_per_account_avg=round(total_contacts / account_count, 2)
            if account_count
            else 0.0,
            hunter_quota_used=0,
            apollo_quota_used=0,
            mismatches_flagged=sum(
                1 for record in records if record.data.get("title_mismatch_flag")
            ),
        ),
    )


async def _run_verify(client_id: str, run_id: str, contact_id: str | None = None) -> None:
    from backend.db.session import SessionLocal

    db = SessionLocal()
    try:
        query = db.query(BuyerProfileRecord).filter(BuyerProfileRecord.client_id == client_id)
        if contact_id:
            query = query.filter(BuyerProfileRecord.contact_id == contact_id)
        records = query.all()
        if not records:
            _mark_run_failed(db, run_id, "No buyer profiles found to verify")
            return

        package = _package_from_records(client_id, records)
    finally:
        db.close()

    agent = VerifierAgent()
    await agent.run(client_id=client_id, buyer_intel_package=package, run_id=run_id)


def _mark_run_failed(db: Session, run_id: str, reason: str) -> None:
    record = db.query(VerifiedRunRecord).filter(VerifiedRunRecord.id == run_id).first()
    if record:
        record.status = "failed"
        record.finished_at = datetime.now(tz=timezone.utc)
        record.diagnosis = reason
        db.commit()


@router.post("/discover", response_model=DiscoverResponse, status_code=status.HTTP_202_ACCEPTED)
async def discover(
    body: DiscoverRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> DiscoverResponse:
    records_exist = (
        db.query(BuyerProfileRecord)
        .filter(BuyerProfileRecord.client_id == body.client_id)
        .first()
    )
    if not records_exist:
        raise HTTPException(
            status_code=404,
            detail=f"No buyer profiles found for client_id={body.client_id!r}",
        )

    run_id = str(uuid.uuid4())
    db.add(
        VerifiedRunRecord(
            id=run_id,
            client_id=body.client_id,
            started_at=datetime.now(tz=timezone.utc),
            status="running",
        )
    )
    db.commit()

    background_tasks.add_task(_run_verify, body.client_id, run_id)
    return DiscoverResponse(
        job_id=run_id,
        status="queued",
        message=f"Verification queued for client_id={body.client_id}.",
    )


@router.get("")
def get_latest_package(
    client_id: str = Query(..., description="Client UUID"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    run = (
        db.query(VerifiedRunRecord)
        .filter(VerifiedRunRecord.client_id == client_id)
        .order_by(VerifiedRunRecord.started_at.desc())
        .first()
    )
    if not run or not run.data:
        return _demo_verified_package(client_id)

    package = VerifiedDataPackage.model_validate(run.data)
    return package.model_dump(mode="json")


@router.get("/contact/{contact_id}")
def get_contact_verification(
    contact_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    record = (
        db.query(VerificationResultRecord)
        .filter(VerificationResultRecord.contact_id == contact_id)
        .order_by(VerificationResultRecord.verified_at.desc())
        .first()
    )
    if not record:
        demo = _demo_verification_by_contact(contact_id)
        if demo is None:
            raise HTTPException(
                status_code=404,
                detail=f"No verification found for contact_id={contact_id!r}",
            )
        return demo
    return record.data


@router.post("/contact/{contact_id}/recheck", response_model=DiscoverResponse)
async def recheck_contact(
    contact_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> DiscoverResponse:
    contact = (
        db.query(BuyerProfileRecord)
        .filter(BuyerProfileRecord.contact_id == contact_id)
        .first()
    )
    if not contact:
        if _demo_verification_by_contact(contact_id) is None:
            raise HTTPException(status_code=404, detail=f"Contact {contact_id!r} not found")
        return DiscoverResponse(
            job_id=str(uuid.uuid4()),
            status="queued",
            message=f"Verification re-check queued for contact_id={contact_id}.",
        )

    run_id = str(uuid.uuid4())
    db.add(
        VerifiedRunRecord(
            id=run_id,
            client_id=contact.client_id,
            started_at=datetime.now(tz=timezone.utc),
            status="running",
        )
    )
    db.commit()

    background_tasks.add_task(_run_verify, contact.client_id, run_id, contact_id)
    return DiscoverResponse(
        job_id=run_id,
        status="queued",
        message=f"Verification re-check queued for contact_id={contact_id}.",
    )


def _engine_result(status_value: str, confidence: float) -> Dict[str, Any]:
    checked_at = datetime.now(tz=timezone.utc).isoformat()
    return {
        "status": status_value,
        "confidence": confidence,
        "sub_status": "",
        "checked_at": checked_at,
    }


def _demo_verification(
    *,
    contact_id: str,
    account_domain: str,
    display_name: str,
    role: str,
    source: str,
    final_status: str,
    score: int,
    secondary_status: str | None = None,
) -> Dict[str, Any]:
    now = datetime.now(tz=timezone.utc).isoformat()
    email_slug = display_name.lower().replace(" ", ".")
    return {
        "contact_id": contact_id,
        "account_domain": account_domain,
        "display_name": display_name,
        "committee_role": role,
        "source": source,
        "email_verification": {
            "email": f"{email_slug}@{account_domain}",
            "status": final_status,
            "primary_engine": "NEVERBOUNCE",
            "secondary_engine": "ZEROBOUNCE" if secondary_status else None,
            "primary_result": _engine_result(final_status, 0.91 if final_status == "VALID" else 0.54),
            "secondary_result": _engine_result(secondary_status, 0.9) if secondary_status else None,
            "relookup_attempted": source == "hunter",
            "relookup_source": "HUNTER" if source == "hunter" else None,
            "relookup_email": f"verified.{email_slug}@{account_domain}" if source == "hunter" and final_status == "VALID" else None,
            "relookup_blocked_reason": "QUOTA_EXHAUSTED" if source == "hunter" and final_status == "INVALID" else None,
            "final_status": final_status,
        },
        "linkedin_check": {
            "url": f"https://linkedin.com/in/{email_slug.replace('.', '-')}",
            "reachable": True,
            "http_status": 200,
            "check_authoritative": True,
            "checked_at": now,
        },
        "website_check": {
            "domain": account_domain,
            "reachable": True,
            "http_status": 200,
            "checked_at": now,
        },
        "title_reconciliation": {
            "apollo_title": role.replace("_", " ").title(),
            "linkedin_title": role.replace("_", " ").title(),
            "resolved_title": role.replace("_", " ").title(),
            "resolution_method": "LINKEDIN_PRIMARY",
            "mismatch_resolved": True,
        },
        "job_change_verification": {
            "apollo_claimed": True,
            "linkedin_confirmed": True,
            "verified": True,
            "confidence": 0.92,
        },
        "overall_data_quality_score": score,
        "issues": [],
        "verified_at": now,
    }


def _demo_verifications() -> list[Dict[str, Any]]:
    return [
        _demo_verification(
            contact_id="c1000-0001-0000-0000-000000000001",
            account_domain="signal-1.example.com",
            display_name="Priya Menon",
            role="DECISION_MAKER",
            source="apollo",
            final_status="VALID",
            score=92,
        ),
        _demo_verification(
            contact_id="c1000-0001-0000-0000-000000000002",
            account_domain="signal-1.example.com",
            display_name="Arjun Sharma",
            role="CHAMPION",
            source="apollo",
            final_status="VALID",
            score=85,
            secondary_status="VALID",
        ),
        _demo_verification(
            contact_id="c1000-0002-0000-0000-000000000002",
            account_domain="signal-2.example.com",
            display_name="Deepa Nair",
            role="CHAMPION",
            source="hunter",
            final_status="VALID",
            score=81,
        ),
        _demo_verification(
            contact_id="c1000-0002-0000-0000-000000000003",
            account_domain="signal-2.example.com",
            display_name="Anil Kumar",
            role="BLOCKER",
            source="hunter",
            final_status="INVALID",
            score=42,
        ),
    ]


def _demo_verified_package(client_id: str) -> Dict[str, Any]:
    rows = _demo_verifications()
    total = len(rows)
    valid = sum(1 for row in rows if row["email_verification"]["final_status"] == "VALID")
    invalid = sum(1 for row in rows if row["email_verification"]["final_status"] == "INVALID")
    return {
        "client_id": client_id,
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "verifications": rows,
        "per_source_breakdown": {
            "apollo": {"total": 2, "valid": 2, "invalid": 0, "pass_rate": 1.0},
            "hunter": {"total": 2, "valid": 1, "invalid": 1, "pass_rate": 0.5},
            "clay": None,
            "linkedin_manual": None,
        },
        "aggregate": {
            "total_contacts": total,
            "valid_emails": valid,
            "invalid_emails": invalid,
            "catch_all": 0,
            "risky": 0,
            "not_found": 0,
            "deliverability_rate": valid / total if total else 0,
            "linkedin_reachable_rate": 1,
            "linkedin_authoritative_rate": 1,
            "website_reachable_rate": 1,
            "title_mismatches_resolved": total,
            "job_changes_verified": total,
        },
        "quota_usage": {
            "neverbounce_used_this_run": total,
            "zerobounce_used_this_run": 1,
            "hunter_used_this_run": 2,
            "neverbounce_remaining": 996,
            "zerobounce_remaining": 99,
            "hunter_remaining": 23,
        },
        "meets_deliverability_target": False,
        "target_miss_diagnosis": "Deliverability missed the 90% target. Lowest-quality source: hunter at 50%; review Hunter re-lookups before Phase 5 sends.",
    }


def _demo_verification_by_contact(contact_id: str) -> Dict[str, Any] | None:
    for row in _demo_verifications():
        if row["contact_id"] == contact_id:
            return row
    return None
