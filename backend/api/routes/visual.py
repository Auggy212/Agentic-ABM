from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.agents.visual.agent import VisualAgent
from backend.db.models import VisualAssetRecord
from backend.db.session import get_db

router = APIRouter(prefix="/api/visual", tags=["visual"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class VisualAssetOut(BaseModel):
    id: str
    client_id: str
    message_id: Optional[str]
    account_domain: str
    contact_id: Optional[str]
    channel: str
    design_type: str
    canva_design_id: Optional[str]
    canva_edit_url: Optional[str]
    canva_view_url: Optional[str]
    thumbnail_url: Optional[str]
    prompt_used: str
    status: str
    error_detail: Optional[str]

    class Config:
        from_attributes = True


class PrepareResponse(BaseModel):
    prepared: list[dict[str, Any]]
    message: str


class MarkReadyRequest(BaseModel):
    canva_design_id: str
    canva_edit_url: Optional[str] = None
    canva_view_url: Optional[str] = None
    thumbnail_url: Optional[str] = None


class MarkFailedRequest(BaseModel):
    error_detail: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/prepare/{client_id}", response_model=PrepareResponse)
def prepare_assets(client_id: str, db: Session = Depends(get_db)):
    """
    Scan CP3-approved messages for a client and create PENDING VisualAssetRecords.
    Returns the list of asset stubs with prompts ready for Canva MCP generation.
    Idempotent â€” already-prepared messages are skipped.
    """
    agent = VisualAgent(db)
    prepared = agent.prepare_assets(client_id)
    return PrepareResponse(
        prepared=prepared,
        message=f"{len(prepared)} new asset(s) queued for generation",
    )


@router.get("/{client_id}", response_model=list[VisualAssetOut])
def list_assets(client_id: str, db: Session = Depends(get_db)):
    """Return all visual assets for a client, newest first."""
    agent = VisualAgent(db)
    return agent.list_assets(client_id)


@router.patch("/{asset_id}/ready", response_model=VisualAssetOut)
def mark_ready(asset_id: str, body: MarkReadyRequest, db: Session = Depends(get_db)):
    """
    Called after Canva MCP successfully generates a design.
    Updates the asset status to READY and stores Canva identifiers.
    """
    agent = VisualAgent(db)
    try:
        return agent.mark_ready(
            asset_id,
            canva_design_id=body.canva_design_id,
            canva_edit_url=body.canva_edit_url,
            canva_view_url=body.canva_view_url,
            thumbnail_url=body.thumbnail_url,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.patch("/{asset_id}/failed", response_model=VisualAssetOut)
def mark_failed(asset_id: str, body: MarkFailedRequest, db: Session = Depends(get_db)):
    """Mark an asset generation as failed with an error detail."""
    agent = VisualAgent(db)
    try:
        return agent.mark_failed(asset_id, body.error_detail)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{asset_id}/detail", response_model=VisualAssetOut)
def get_asset(asset_id: str, db: Session = Depends(get_db)):
    """Fetch a single visual asset by ID."""
    asset = db.get(VisualAssetRecord, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail=f"Asset {asset_id!r} not found")
    return asset

