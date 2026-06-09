"""
ICP Accounts API routes.

POST  /api/accounts/discover         â€” run ICP Scout for a client_id
GET   /api/accounts?client_id=X      â€” list accounts (active only, paginated)
GET   /api/accounts/{account_id}     â€” single account detail
DELETE /api/accounts/{account_id}    â€” soft-delete with optional reason
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.agents.icp_scout.agent import ICPScoutAgent
from backend.db.models import ICPAccountRecord, ICPRunRecord, MasterContextRecord
from backend.db.session import get_db
from backend.schemas.models import ICPAccount, ICPAccountList, MasterContext


def _normalize_account_data(record: ICPAccountRecord) -> dict:
    """Re-parse stored data through ICPAccount so aliases (type/date on signals) are correct."""
    try:
        parsed = ICPAccount.model_validate(record.data)
        return {"id": record.id, **parsed.model_dump(mode="json", by_alias=True)}
    except Exception:
        return {"id": record.id, **record.data}

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


# ---------------------------------------------------------------------------
# Request / response helpers
# ---------------------------------------------------------------------------

class DiscoverRequest(BaseModel):
    client_id: str = Field(..., description="Client UUID to run discovery for")


class AccountListResponse(BaseModel):
    accounts: List[dict]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/discover")
async def discover(
    body: DiscoverRequest,
    db: Session = Depends(get_db),
) -> dict:
    """
    Trigger a fresh ICP Scout run for the given client_id.

    Loads the most recent MasterContext for the client, runs discovery,
    persists accounts, and returns the ICPAccountList.
    """
    mc_record = (
        db.query(MasterContextRecord)
        .filter(MasterContextRecord.client_id == body.client_id)
        .order_by(MasterContextRecord.created_at.desc())
        .first()
    )
    if not mc_record:
        raise HTTPException(
            status_code=404,
            detail=f"No MasterContext found for client_id={body.client_id!r}",
        )

    master_context = MasterContext.model_validate(mc_record.data)

    run_id = str(uuid.uuid4())
    run_record = ICPRunRecord(
        id=run_id,
        client_id=body.client_id,
        started_at=datetime.now(tz=timezone.utc),
        status="running",
    )
    db.add(run_record)
    db.commit()

    try:
        agent = ICPScoutAgent()
        result: ICPAccountList = await agent.run(master_context)
    except Exception as exc:
        run_record.status = "failed"
        run_record.finished_at = datetime.now(tz=timezone.utc)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Discovery failed: {exc}") from exc

    for account in result.accounts:
        record = ICPAccountRecord(
            id=str(uuid.uuid4()),
            client_id=body.client_id,
            run_id=run_id,
            domain=account.domain,
            company_name=account.company_name,
            tier=account.tier.value,
            icp_score=account.icp_score,
            source=account.source.value,
            data=account.model_dump(mode="json", by_alias=True),
            is_removed=False,
        )
        db.add(record)

    run_record.status = "complete"
    run_record.finished_at = datetime.now(tz=timezone.utc)
    run_record.total_found = result.meta.total_found
    db.commit()

    # RAG: index newly discovered accounts + master context
    try:
        from backend.agents.copilot.rag_indexer import post_run_index
        post_run_index(db, body.client_id, ["icp_accounts", "master_contexts"])
    except Exception:
        pass

    return {
        "run_id": run_id,
        "status": "complete",
        "result": result.model_dump(mode="json"),
    }


@router.get("")
def list_accounts(
    client_id: str = Query(..., description="Client UUID"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=100, description="Results per page"),
    tier: Optional[str] = Query(None, description="Filter by tier: TIER_1 | TIER_2 | TIER_3"),
    db: Session = Depends(get_db),
) -> AccountListResponse:
    """List active (non-removed) accounts for a client, ordered by icp_score desc."""
    q = (
        db.query(ICPAccountRecord)
        .filter(
            ICPAccountRecord.client_id == client_id,
            ICPAccountRecord.is_removed == False,  # noqa: E712
        )
    )
    if tier:
        q = q.filter(ICPAccountRecord.tier == tier)

    total = q.count()
    records = (
        q.order_by(ICPAccountRecord.icp_score.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return AccountListResponse(
        accounts=[_normalize_account_data(r) for r in records],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{account_id}")
def get_account(
    account_id: str,
    db: Session = Depends(get_db),
) -> dict:
    """Fetch a single account by its UUID."""
    record = db.query(ICPAccountRecord).filter(ICPAccountRecord.id == account_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Account {account_id!r} not found")
    if record.is_removed:
        raise HTTPException(status_code=410, detail=f"Account {account_id!r} has been removed")
    return _normalize_account_data(record)


@router.delete("/{account_id}")
def delete_account(
    account_id: str,
    reason: Optional[str] = Query(None, description="Reason for removal"),
    db: Session = Depends(get_db),
) -> dict:
    """
    Soft-delete an account.

    Sets is_removed=True and records the optional removal reason.
    The row is retained for Phase 2 agents that reference account IDs.
    """
    record = db.query(ICPAccountRecord).filter(ICPAccountRecord.id == account_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"Account {account_id!r} not found")
    if record.is_removed:
        raise HTTPException(status_code=409, detail=f"Account {account_id!r} is already removed")

    record.is_removed = True
    record.removed_reason = reason
    db.commit()

    return {"account_id": account_id, "status": "removed", "reason": reason}

