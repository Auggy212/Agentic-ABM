from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.schemas.models import CP4Status, SalesHandoffNote


SLA_HOURS = 24


class CP4Blocker(Exception):
    """Raised when a CP4 transition is attempted from an invalid state."""


def check_can_accept(handoff: SalesHandoffNote) -> None:
    if handoff.status != CP4Status.PENDING:
        raise CP4Blocker(f"Cannot accept handoff in status={handoff.status.value!r}; must be PENDING")
    if handoff.notify_sent_at is None:
        raise CP4Blocker("Cannot accept handoff before Sales Exec was notified")


def check_can_reject(handoff: SalesHandoffNote) -> None:
    if handoff.status != CP4Status.PENDING:
        raise CP4Blocker(f"Cannot reject handoff in status={handoff.status.value!r}; must be PENDING")
    if handoff.notify_sent_at is None:
        raise CP4Blocker("Cannot reject handoff before Sales Exec was notified")


def is_overdue(handoff: SalesHandoffNote, *, now: datetime | None = None) -> bool:
    """True iff handoff is PENDING and >SLA_HOURS have elapsed since notify_sent_at."""
    if handoff.status != CP4Status.PENDING or handoff.notify_sent_at is None:
        return False
    current = now or datetime.now(tz=timezone.utc)
    return current - handoff.notify_sent_at >= timedelta(hours=SLA_HOURS)
