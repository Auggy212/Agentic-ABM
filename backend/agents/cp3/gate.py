from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db.models import CP3ReviewStateRecord
from backend.schemas.models import CP3Status


class CP3NotApprovedError(Exception):
    """Raised when Phase 5 attempts to run before CP3 is approved."""


def assert_cp3_approved(client_id: str, db: Session) -> None:
    record = db.query(CP3ReviewStateRecord).filter(CP3ReviewStateRecord.client_id == client_id).first()
    if record is None:
        raise CP3NotApprovedError(f"CP3 review has not been opened for client_id={client_id!r}; Phase 5 is locked")
    if record.status != CP3Status.APPROVED.value:
        raise CP3NotApprovedError(f"CP3 review status is {record.status!r}, not APPROVED; Phase 5 is locked")

