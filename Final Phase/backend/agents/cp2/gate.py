"""
Phase 4 hard gate. Phase 4 (Storyteller) MUST call assert_cp2_approved() at
the start of its run; the API also enforces it on POST /api/storyteller/discover.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db.models import CP2ReviewStateRecord
from backend.schemas.models import CP2Status


class CP2NotApprovedError(Exception):
    """Raised when downstream code attempts to run before CP2 is APPROVED."""


def assert_cp2_approved(client_id: str, db: Session) -> None:
    """
    Raise CP2NotApprovedError unless this client has an APPROVED CP2 review.

    No state, no return value — the success path is silent. Callers should
    catch CP2NotApprovedError to surface the lock to UI / API consumers.
    """

    record = (
        db.query(CP2ReviewStateRecord)
        .filter(CP2ReviewStateRecord.client_id == client_id)
        .first()
    )
    if record is None:
        raise CP2NotApprovedError(
            f"CP2 review has not been opened for client_id={client_id!r}; "
            "Phase 4 is locked"
        )
    if record.status != CP2Status.APPROVED.value:
        raise CP2NotApprovedError(
            f"CP2 review status is {record.status!r}, not APPROVED; "
            "Phase 4 is locked"
        )
