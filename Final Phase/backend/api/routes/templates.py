from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.agents.storyteller.templates.registry import (
    TemplateNotFoundError,
    TemplateRegistry,
    TemplateRegistryError,
)
from backend.db.session import get_db
from backend.schemas.models import MessageChannel, MessageEngineTarget, PromptTemplate, TierTarget

router = APIRouter(prefix="/api/templates", tags=["templates"])


class DeprecateTemplateRequest(BaseModel):
    reason: str


def _require_admin(token: Optional[str]) -> None:
    expected = os.environ.get("TEMPLATE_ADMIN_TOKEN")
    if expected and token != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid template admin token")
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TEMPLATE_ADMIN_TOKEN is not configured",
        )


def _dump(template: PromptTemplate) -> Dict[str, Any]:
    return template.model_dump(mode="json")


@router.get("")
def list_templates(
    channel: Optional[MessageChannel] = Query(None),
    tier: Optional[TierTarget] = Query(None),
    db: Session = Depends(get_db),
) -> list[Dict[str, Any]]:
    registry = TemplateRegistry(db)
    return [_dump(template) for template in registry.list_active(channel=channel, tier=tier)]


@router.get("/history")
def history(
    channel: MessageChannel = Query(...),
    tier: TierTarget = Query(...),
    sequence_position: int = Query(..., ge=0),
    db: Session = Depends(get_db),
) -> list[Dict[str, Any]]:
    registry = TemplateRegistry(db)
    return [
        _dump(template)
        for template in registry.history(channel, tier, sequence_position)
    ]


@router.get("/{slot}/history")
def history_by_slot(
    slot: str,
    channel: Optional[MessageChannel] = Query(None),
    tier: Optional[TierTarget] = Query(None),
    sequence_position: Optional[int] = Query(None, ge=0),
    db: Session = Depends(get_db),
) -> list[Dict[str, Any]]:
    if channel is None or tier is None or sequence_position is None:
        parts = slot.split(":")
        if len(parts) != 3:
            raise HTTPException(
                status_code=422,
                detail="slot must be 'CHANNEL:TIER:POSITION' or provide channel, tier, sequence_position query params",
            )
        channel = MessageChannel(parts[0])
        tier = TierTarget(parts[1])
        sequence_position = int(parts[2])
    registry = TemplateRegistry(db)
    return [_dump(template) for template in registry.history(channel, tier, sequence_position)]


@router.get("/resolve")
def resolve_active(
    channel: MessageChannel = Query(...),
    tier: TierTarget = Query(...),
    sequence_position: int = Query(..., ge=0),
    engine: MessageEngineTarget = Query(...),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    registry = TemplateRegistry(db)
    try:
        return _dump(registry.get_active(channel, tier, sequence_position, engine))
    except TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{template_id}")
def get_template(template_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    template = TemplateRegistry(db).get(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return _dump(template)


@router.post("")
def create_template(
    template: PromptTemplate,
    x_template_admin_token: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    _require_admin(x_template_admin_token)
    try:
        return _dump(TemplateRegistry(db).register(template))
    except TemplateRegistryError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{template_id}/activate")
def activate_template(
    template_id: str,
    x_template_admin_token: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    _require_admin(x_template_admin_token)
    try:
        TemplateRegistry(db).activate(template_id)
    except TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except TemplateRegistryError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"status": "activated"}


@router.post("/{template_id}/deprecate")
def deprecate_template(
    template_id: str,
    body: DeprecateTemplateRequest,
    x_template_admin_token: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    _require_admin(x_template_admin_token)
    try:
        TemplateRegistry(db).deprecate(template_id, body.reason)
    except TemplateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "deprecated"}
