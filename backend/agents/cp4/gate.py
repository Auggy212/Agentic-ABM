from __future__ import annotations

from sqlalchemy.orm import Session

from backend.db.models import SalesHandoffRecord
from backend.schemas.models import CP4Status


class CP4NotAcceptedError(Exception):
    """Raised when downstream automation requires a CP4-accepted handoff but the
    handoff is missing, still PENDING, REJECTED, or ESCALATED."""


def assert_cp4_accepted(handoff_id: str, db: Session) -> None:
    record = db.query(SalesHandoffRecord).filter(SalesHandoffRecord.id == handoff_id).first()
    if record is None:
        raise CP4NotAcceptedError(f"CP4 handoff {handoff_id!r} does not exist")
    if record.status != CP4Status.ACCEPTED.value:
        raise CP4NotAcceptedError(
            f"CP4 handoff {handoff_id!r} status is {record.status!r}, not ACCEPTED"
        )
