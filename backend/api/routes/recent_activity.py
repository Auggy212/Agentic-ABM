"""
Recent activity API routes.

Phase 3 returns empty RecentActivityStub rows. Phase 5 keeps these endpoint
shapes and swaps in the real PhantomBuster client behind the agent.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.agents.recent_activity.agent import RecentActivityAgent, build_empty_stub
from backend.db.models import BuyerProfileRecord, RecentActivityRecord
from backend.db.session import get_db
from backend.schemas.models import (
    BuyerIntelMeta,
    BuyerIntelPackage,
    BuyerProfile,
    RecentActivityStub,
)

router = APIRouter(prefix="/api/recent-activity", tags=["recent-activity"])


class DiscoverRequest(BaseModel):
    client_id: str = Field(..., description="Client UUID to create recent-activity stubs for")


class DiscoverResponse(BaseModel):
    job_id: str
    status: str
    total_contacts: int
    message: str


def _package_from_profiles(client_id: str, records: list[BuyerProfileRecord]) -> BuyerIntelPackage:
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


def _upsert_stub(
    db: Session,
    *,
    client_id: str,
    stub: RecentActivityStub,
) -> RecentActivityRecord:
    data = stub.model_dump(mode="json")
    record = (
        db.query(RecentActivityRecord)
        .filter(RecentActivityRecord.contact_id == str(stub.contact_id))
        .first()
    )
    if record:
        record.client_id = client_id
        record.data = data
        record.source = stub.source.value
        record.scraped_at = stub.scraped_at
        record.has_data = False
    else:
        record = RecentActivityRecord(
            client_id=client_id,
            contact_id=str(stub.contact_id),
            data=data,
            source=stub.source.value,
            scraped_at=stub.scraped_at,
            has_data=False,
        )
        db.add(record)
    return record


async def _create_stubs_for_client(
    db: Session,
    *,
    client_id: str,
) -> dict[str, RecentActivityStub]:
    records = (
        db.query(BuyerProfileRecord)
        .filter(BuyerProfileRecord.client_id == client_id)
        .all()
    )
    if not records:
        raise HTTPException(
            status_code=404,
            detail=f"No buyer profiles found for client_id={client_id!r}",
        )

    package = _package_from_profiles(client_id, records)
    stubs = await RecentActivityAgent().run(client_id, package)
    for stub in stubs.values():
        _upsert_stub(db, client_id=client_id, stub=stub)
    db.commit()
    return stubs


def _record_to_payload(record: RecentActivityRecord) -> dict[str, Any]:
    stub = RecentActivityStub.model_validate(record.data)
    return stub.model_dump(mode="json")


@router.post("/discover", response_model=DiscoverResponse, status_code=status.HTTP_202_ACCEPTED)
async def discover(
    body: DiscoverRequest,
    db: Session = Depends(get_db),
) -> DiscoverResponse:
    stubs = await _create_stubs_for_client(db, client_id=body.client_id)
    job_id = str(uuid.uuid4())
    return DiscoverResponse(
        job_id=job_id,
        status="complete_stub",
        total_contacts=len(stubs),
        message=(
            "Recent activity stub run complete. PhantomBuster scraping is deferred to Phase 5."
        ),
    )


@router.get("")
async def get_recent_activity(
    contact_id: Optional[str] = Query(None, description="Return one contact's activity stub"),
    client_id: Optional[str] = Query(None, description="Return all stubs for a client"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if not contact_id and not client_id:
        raise HTTPException(
            status_code=400,
            detail="Provide either contact_id or client_id query parameter.",
        )
    if contact_id and client_id:
        raise HTTPException(
            status_code=400,
            detail="Provide only one of contact_id or client_id.",
        )

    if contact_id:
        record = (
            db.query(RecentActivityRecord)
            .filter(RecentActivityRecord.contact_id == contact_id)
            .first()
        )
        if record:
            return _record_to_payload(record)

        buyer = (
            db.query(BuyerProfileRecord)
            .filter(BuyerProfileRecord.contact_id == contact_id)
            .first()
        )
        if not buyer:
            raise HTTPException(
                status_code=404,
                detail=f"No buyer profile found for contact_id={contact_id!r}",
            )
        stub = build_empty_stub(uuid.UUID(contact_id))
        _upsert_stub(db, client_id=buyer.client_id, stub=stub)
        db.commit()
        return stub.model_dump(mode="json")

    assert client_id is not None
    records = (
        db.query(RecentActivityRecord)
        .filter(RecentActivityRecord.client_id == client_id)
        .all()
    )
    if not records:
        await _create_stubs_for_client(db, client_id=client_id)
        records = (
            db.query(RecentActivityRecord)
            .filter(RecentActivityRecord.client_id == client_id)
            .all()
        )

    return {record.contact_id: _record_to_payload(record) for record in records}
