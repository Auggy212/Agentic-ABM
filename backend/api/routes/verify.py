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
        raise HTTPException(
            status_code=404,
            detail=f"No verification package found for client_id={client_id!r}",
        )

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
        raise HTTPException(
            status_code=404,
            detail=f"No verification found for contact_id={contact_id!r}",
        )
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
        raise HTTPException(status_code=404, detail=f"Contact {contact_id!r} not found")

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
