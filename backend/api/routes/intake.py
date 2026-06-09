"""
POST /api/intake             - validate + emit MasterContext
POST /api/intake/draft       - auto-save partial submission to SQLite + Redis
GET  /api/intake/draft/{client_id} - resume saved draft
POST /api/intake/csv         - upload optional existing account list CSV
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.agents.intake.agent import CsvParseResult, IntakeAgent, ValidationResult
from backend.db import redis_client
from backend.db.models import IntakeDraftRecord, MasterContextRecord
from backend.db.session import get_db
from backend.schemas.models import MasterContext

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/intake", tags=["intake"])
_agent = IntakeAgent()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class MasterContextSubmission(BaseModel):
    company: Optional[Dict[str, Any]] = None
    icp: Optional[Dict[str, Any]] = None
    buyers: Optional[Dict[str, Any]] = None
    competitors: Optional[List[Dict[str, Any]]] = None
    gtm: Optional[Dict[str, Any]] = None
    negative_icp_confirmed_empty: bool = Field(False)
    client_id: Optional[str] = Field(None)
    force_complete: bool = Field(
        False,
        description=(
            "When True, skip vague-value checks and proceed to context construction. "
            "Used after the user has already answered clarifying questions."
        ),
    )


class ClarifyingQuestion(BaseModel):
    field: str
    question: str


class IntakeResponse(BaseModel):
    status: str  # "complete" | "needs_clarification"
    master_context: Optional[Dict[str, Any]] = None
    clarifying_questions: Optional[List[ClarifyingQuestion]] = None
    warnings: List[str] = Field(default_factory=list)


class DraftSaveRequest(BaseModel):
    client_id: str = Field(..., description="UUID identifying the client session")
    payload: Dict[str, Any] = Field(..., description="Partial submission dict")


class DraftSaveResponse(BaseModel):
    draft_id: str
    saved_at: str


class CsvUploadResponse(BaseModel):
    valid: bool
    row_count: int
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    preview: List[Dict[str, str]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=IntakeResponse, status_code=status.HTTP_200_OK)
def submit_intake(
    submission: MasterContextSubmission,
    db: Session = Depends(get_db),
) -> IntakeResponse:
    raw = submission.model_dump()
    provided_client_id = raw.pop("client_id", None)
    force_complete = raw.pop("force_complete", False)
    result: ValidationResult = _agent.validate(raw)

    if result.errors or (result.clarifying_questions and not force_complete):
        return IntakeResponse(
            status="needs_clarification",
            clarifying_questions=[
                ClarifyingQuestion(field=q["field"], question=q["question"])
                for q in result.clarifying_questions
            ],
            warnings=result.warnings,
        )

    try:
        master_context: MasterContext = _agent.build_master_context(raw, client_id=provided_client_id)
    except Exception as exc:
        logger.exception("build_master_context failed after clean validation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Context construction failed: {exc}",
        ) from exc

    context_dict = master_context.model_dump(mode="json")
    _persist_master_context(db, master_context, context_dict)

    return IntakeResponse(
        status="complete",
        master_context=context_dict,
        warnings=result.warnings,
    )


@router.post("/draft", response_model=DraftSaveResponse, status_code=status.HTTP_200_OK)
def save_draft(body: DraftSaveRequest, db: Session = Depends(get_db)) -> DraftSaveResponse:
    """
    Persist a partial intake submission to SQLite (durable) and Redis (fast cache).
    Idempotent - calling again with the same client_id overwrites the draft.
    The draft is never deleted, even after intake completes, so the user can
    return and see what they originally submitted.
    """
    try:
        uuid.UUID(body.client_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="client_id must be a valid UUID.",
        )

    now = datetime.now(tz=timezone.utc)

    # Primary: SQLite - survives Redis restarts
    existing = db.query(IntakeDraftRecord).filter(
        IntakeDraftRecord.client_id == body.client_id
    ).first()
    if existing:
        existing.data = body.payload
        existing.updated_at = now
    else:
        db.add(IntakeDraftRecord(client_id=body.client_id, data=body.payload, updated_at=now))
    db.commit()

    # Secondary: Redis - best-effort fast cache
    try:
        redis_client.save_draft(body.client_id, body.payload)
    except Exception:
        logger.warning("Redis save_draft failed for client_id=%s (SQLite write succeeded)", body.client_id)

    return DraftSaveResponse(
        draft_id=body.client_id,
        saved_at=now.isoformat(),
    )


@router.get("/draft/{client_id}", response_model=Dict[str, Any])
def resume_draft(client_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Return a previously saved draft - Redis first, SQLite fallback."""
    try:
        uuid.UUID(client_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="client_id must be a valid UUID.",
        )

    # Try Redis first (fast path)
    try:
        draft = redis_client.load_draft(client_id)
        if draft is not None:
            return draft
    except Exception:
        logger.warning("Redis load_draft failed for client_id=%s, falling back to SQLite", client_id)

    # Fallback: SQLite
    record = db.query(IntakeDraftRecord).filter(
        IntakeDraftRecord.client_id == client_id
    ).first()
    if record:
        return record.data

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"No draft found for client_id={client_id}.",
    )


@router.post("/csv", response_model=CsvUploadResponse, status_code=status.HTTP_200_OK)
async def upload_csv(file: UploadFile = File(...)) -> CsvUploadResponse:
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only CSV files are accepted.",
        )

    content = await file.read()
    parse_result: CsvParseResult = _agent.parse_csv_upload(content, file.filename)

    return CsvUploadResponse(
        valid=parse_result.valid,
        row_count=len(parse_result.rows),
        warnings=parse_result.warnings,
        errors=parse_result.errors,
        preview=parse_result.rows[:5],
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _persist_master_context(
    db: Session,
    master_context: MasterContext,
    context_dict: dict,
) -> None:
    record = MasterContextRecord(
        client_id=str(master_context.meta.client_id),
        version=master_context.meta.version,
        data=context_dict,
    )
    db.add(record)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.exception("Failed to persist MasterContext for client_id=%s", master_context.meta.client_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist context. Please retry.",
        ) from exc
