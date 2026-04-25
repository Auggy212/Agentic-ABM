"""
POST /api/intake             — validate + emit MasterContext
POST /api/intake/draft       — auto-save partial submission to Redis
GET  /api/intake/draft/{client_id} — resume saved draft
POST /api/intake/csv         — upload optional existing account list CSV
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
from backend.db.models import MasterContextRecord
from backend.db.session import get_db
from backend.schemas.models import MasterContext

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/intake", tags=["intake"])
_agent = IntakeAgent()


# ---------------------------------------------------------------------------
# Request / Response schemas (looser than MasterContext — allows partials)
# ---------------------------------------------------------------------------

class MasterContextSubmission(BaseModel):
    """
    Intake form payload. Fields mirror MasterContext but all are Optional so
    the API can accept partial submissions and return clarifying questions
    rather than hard-rejecting incomplete forms.

    The `negative_icp_confirmed_empty` flag must be explicitly set to True
    when the caller intends to submit an empty exclusion list.
    """

    company: Optional[Dict[str, Any]] = None
    icp: Optional[Dict[str, Any]] = None
    buyers: Optional[Dict[str, Any]] = None
    competitors: Optional[List[Dict[str, Any]]] = None
    gtm: Optional[Dict[str, Any]] = None
    # NOT in MasterContext schema — stripped before context construction
    negative_icp_confirmed_empty: bool = Field(
        False,
        description=(
            "Set to true to confirm that an empty negative_icp list is intentional. "
            "Required to suppress the clarifying question for that field."
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
    """
    Validate a full intake submission.

    - If all fields are valid and no clarifying questions arise → status=complete,
      master_context is returned and persisted to Postgres.
    - Otherwise → status=needs_clarification with the list of open questions.
    """
    raw = submission.model_dump()
    result: ValidationResult = _agent.validate(raw)

    if result.errors or result.clarifying_questions:
        return IntakeResponse(
            status="needs_clarification",
            clarifying_questions=[
                ClarifyingQuestion(field=q["field"], question=q["question"])
                for q in result.clarifying_questions
            ],
            warnings=result.warnings,
        )

    try:
        master_context: MasterContext = _agent.build_master_context(raw)
    except Exception as exc:
        logger.exception("build_master_context failed after clean validation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Context construction failed: {exc}",
        ) from exc

    context_dict = master_context.model_dump(mode="json")
    _persist_master_context(db, master_context, context_dict)

    # Clean up any in-progress draft
    client_id = str(master_context.meta.client_id)
    try:
        redis_client.delete_draft(client_id)
    except Exception:  # noqa: BLE001
        logger.warning("Could not delete draft for client_id=%s after completion", client_id)

    return IntakeResponse(
        status="complete",
        master_context=context_dict,
        warnings=result.warnings,
    )


@router.post("/draft", response_model=DraftSaveResponse, status_code=status.HTTP_200_OK)
def save_draft(body: DraftSaveRequest) -> DraftSaveResponse:
    """
    Persist a partial intake submission to Redis with a 7-day TTL.
    Idempotent — calling again with the same client_id overwrites the draft.
    """
    try:
        uuid.UUID(body.client_id)  # validate it looks like a UUID
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="client_id must be a valid UUID.",
        )

    try:
        redis_client.save_draft(body.client_id, body.payload)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Redis save_draft failed for client_id=%s", body.client_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Draft persistence unavailable. Please retry.",
        ) from exc

    return DraftSaveResponse(
        draft_id=body.client_id,
        saved_at=datetime.now(tz=timezone.utc).isoformat(),
    )


@router.get("/draft/{client_id}", response_model=Dict[str, Any])
def resume_draft(client_id: str) -> Dict[str, Any]:
    """Return a previously saved draft by client_id."""
    try:
        uuid.UUID(client_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="client_id must be a valid UUID.",
        )

    try:
        draft = redis_client.load_draft(client_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Redis load_draft failed for client_id=%s", client_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Draft persistence unavailable. Please retry.",
        ) from exc

    if draft is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No draft found for client_id={client_id}. It may have expired.",
        )
    return draft


@router.post("/csv", response_model=CsvUploadResponse, status_code=status.HTTP_200_OK)
async def upload_csv(file: UploadFile = File(...)) -> CsvUploadResponse:
    """
    Accept a CSV upload for the optional existing_account_list.

    Required columns: "Company Name", "Website"
    Returns a parse report and a 5-row preview.
    """
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
