"""
Buyer Intel API routes.

POST /api/buyers/discover                    — trigger BuyerIntelAgent run (async)
GET  /api/buyers?company={domain}            — BuyerProfiles for one domain
GET  /api/buyers?client_id={uuid}            — full BuyerIntelPackage for a client
GET  /api/buyers/contact/{contact_id}        — single contact detail
PATCH /api/buyers/contact/{contact_id}       — operator manual edit (CP2 audit)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.agents.buyer_intel.agent import BuyerIntelAgent
from backend.db.models import (
    BuyerIntelRunRecord,
    BuyerProfileRecord,
    ICPAccountRecord,
    MasterContextRecord,
)
from backend.db.session import get_db
from backend.schemas.models import (
    AccountTier,
    BuyerIntelMeta,
    BuyerIntelPackage,
    BuyerProfile,
    ICPAccount,
    ICPAccountList,
    MasterContext,
    TierBreakdown,
    AccountListMeta,
)

router = APIRouter(prefix="/api/buyers", tags=["buyers"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class DiscoverRequest(BaseModel):
    client_id: str = Field(..., description="Client UUID to run buyer enrichment for")


class DiscoverResponse(BaseModel):
    job_id: str
    status: str = "queued"
    message: str


class ContactEditRequest(BaseModel):
    current_title: Optional[str] = None
    committee_role: Optional[str] = None
    committee_role_reasoning: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    note: Optional[str] = Field(None, description="Operator note for CP2 audit trail")


class ContactEditResponse(BaseModel):
    contact_id: str
    updated_fields: List[str]
    edited_at: str
    note: Optional[str]


# ---------------------------------------------------------------------------
# Background task
# ---------------------------------------------------------------------------

async def _run_buyer_intel(client_id: str, run_id: str) -> None:
    """
    Background task that runs BuyerIntelAgent for a client.
    Loads the latest MasterContext and approved ICP accounts, then runs enrichment.
    """
    from backend.db.session import SessionLocal
    db = SessionLocal()
    try:
        # Load MasterContext
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

        # Load approved (non-removed) ICP accounts
        account_records = (
            db.query(ICPAccountRecord)
            .filter(
                ICPAccountRecord.client_id == client_id,
                ICPAccountRecord.is_removed == False,  # noqa: E712
            )
            .order_by(ICPAccountRecord.icp_score.desc())
            .all()
        )

        if not account_records:
            _mark_run_failed(db, run_id, "No active ICP accounts found for this client")
            return

        accounts = [ICPAccount.model_validate(r.data) for r in account_records]

        # Build a minimal ICPAccountList (meta reconstructed for the agent)
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

    agent = BuyerIntelAgent()
    await agent.run(
        client_id=client_id,
        account_list=account_list,
        master_context=master_context,
        run_id=run_id,
    )


def _mark_run_failed(db: Session, run_id: str, reason: str) -> None:
    record = db.query(BuyerIntelRunRecord).filter(BuyerIntelRunRecord.id == run_id).first()
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
    """
    Trigger a BuyerIntelAgent run for all approved accounts of a client.

    Runs asynchronously — returns a job_id immediately. Poll the run record
    or the GET /api/buyers?client_id= endpoint to check completion.
    """
    # Validate client exists
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
    run_record = BuyerIntelRunRecord(
        id=run_id,
        client_id=body.client_id,
        started_at=datetime.now(tz=timezone.utc),
        status="running",
    )
    db.add(run_record)
    db.commit()

    background_tasks.add_task(_run_buyer_intel, body.client_id, run_id)

    return DiscoverResponse(
        job_id=run_id,
        status="queued",
        message=(
            f"Buyer enrichment queued for client_id={body.client_id}. "
            f"Track progress with job_id={run_id}."
        ),
    )


@router.get("")
def list_buyers(
    client_id: Optional[str] = Query(None, description="Return all profiles for this client"),
    company: Optional[str] = Query(None, description="Return profiles for this apex domain"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Returns buyer profiles filtered by client_id or company domain.

    - ?client_id={uuid}   → full BuyerIntelPackage (all accounts)
    - ?company={domain}   → list of BuyerProfile for that single domain
    """
    if not client_id and not company:
        raise HTTPException(
            status_code=400,
            detail="Provide either client_id or company query parameter.",
        )

    if company:
        records = (
            db.query(BuyerProfileRecord)
            .filter(BuyerProfileRecord.account_domain == company)
            .all()
        )
        if not records:
            raise HTTPException(status_code=404, detail=f"No buyers found for domain={company!r}")
        return {
            "domain": company,
            "contacts": [{"id": r.id, **r.data} for r in records],
            "total": len(records),
        }

    # client_id path — assemble BuyerIntelPackage from DB
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

    # Group by domain
    domain_map: Dict[str, list] = {}
    for r in records:
        domain_map.setdefault(r.account_domain, []).append({"id": r.id, **r.data})

    # Latest run meta
    run = (
        db.query(BuyerIntelRunRecord)
        .filter(BuyerIntelRunRecord.client_id == client_id)
        .order_by(BuyerIntelRunRecord.started_at.desc())
        .first()
    )

    total_contacts = sum(len(v) for v in domain_map.values())
    accounts_count = len(domain_map)
    avg = total_contacts / accounts_count if accounts_count else 0.0

    return {
        "client_id": client_id,
        "generated_at": run.finished_at.isoformat() if run and run.finished_at else None,
        "accounts": domain_map,
        "meta": {
            "total_accounts_processed": accounts_count,
            "total_contacts_found": total_contacts,
            "contacts_per_account_avg": round(avg, 2),
            "hunter_quota_used": run.total_contacts if run else 0,
            "apollo_quota_used": run.total_accounts if run else 0,
            "mismatches_flagged": sum(
                1 for r in records if r.data.get("title_mismatch_flag")
            ),
            "quota_warnings": run.quota_warnings if run else [],
            "pending_domains": run.pending_domains if run else [],
            "status": run.status if run else "unknown",
        },
    }


@router.get("/contact/{contact_id}")
def get_contact(
    contact_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return a single BuyerProfile by its contact UUID."""
    record = (
        db.query(BuyerProfileRecord)
        .filter(BuyerProfileRecord.contact_id == contact_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail=f"Contact {contact_id!r} not found")
    return {"id": record.id, **record.data}


@router.patch("/contact/{contact_id}", response_model=ContactEditResponse)
def edit_contact(
    contact_id: str,
    body: ContactEditRequest,
    db: Session = Depends(get_db),
) -> ContactEditResponse:
    """
    Operator manual edit for CP2 prep.

    Only whitelisted fields can be changed. Every edit is stamped with
    updated_at for the audit trail; the note field surfaces in CP2 review.
    """
    record = (
        db.query(BuyerProfileRecord)
        .filter(BuyerProfileRecord.contact_id == contact_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail=f"Contact {contact_id!r} not found")

    data: dict = dict(record.data)
    updated_fields: list[str] = []

    if body.current_title is not None:
        data["current_title"] = body.current_title
        # If the operator corrects the title, flag or clear the mismatch
        data["title_mismatch_flag"] = body.current_title != data.get("apollo_title", "")
        updated_fields.append("current_title")

    if body.committee_role is not None:
        data["committee_role"] = body.committee_role
        record.committee_role = body.committee_role
        updated_fields.append("committee_role")

    if body.committee_role_reasoning is not None:
        data["committee_role_reasoning"] = (
            f"[OPERATOR EDIT] {body.committee_role_reasoning}"
        )
        updated_fields.append("committee_role_reasoning")

    if body.email is not None:
        data["email"] = body.email
        data["email_status"] = "UNVERIFIED"   # reset — Verifier will re-check
        updated_fields.append("email")

    if body.phone is not None:
        data["phone"] = body.phone
        updated_fields.append("phone")

    if not updated_fields:
        raise HTTPException(status_code=400, detail="No editable fields provided in request body.")

    now = datetime.now(tz=timezone.utc).isoformat()
    data["_operator_edit_at"] = now
    data["_operator_note"] = body.note

    record.data = data
    record.updated_at = datetime.now(tz=timezone.utc)
    db.commit()

    return ContactEditResponse(
        contact_id=contact_id,
        updated_fields=updated_fields,
        edited_at=now,
        note=body.note,
    )
