from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.db.models import CP4AuditLogRecord, EventRecord, SalesHandoffRecord
from backend.schemas.models import (
    CP4HandoffSummary,
    CP4Status,
    HandoffTriggerEvent,
    SalesHandoffNote,
)

from .invariants import CP4Blocker, check_can_accept, check_can_reject, is_overdue


class CP4StateError(Exception):
    pass


class CP4NotFoundError(Exception):
    pass


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _to_note(record: SalesHandoffRecord) -> SalesHandoffNote:
    return SalesHandoffNote.model_validate(record.data)


def _persist(db: Session, record: SalesHandoffRecord, note: SalesHandoffNote) -> SalesHandoffNote:
    validated = SalesHandoffNote.model_validate(note.model_dump(mode="json"))
    record.data = validated.model_dump(mode="json")
    record.status = validated.status.value
    record.engagement_score = validated.engagement_score
    record.notify_sent_at = validated.notify_sent_at
    record.accepted_at = validated.accepted_at
    record.accepted_by = validated.accepted_by
    record.rejected_at = validated.rejected_at
    record.escalated_at = validated.escalated_at
    db.add(record)
    db.commit()
    return validated


def _audit(
    db: Session,
    *,
    handoff_id: str,
    client_id: str,
    action: str,
    actor: str,
    before: Any = None,
    after: Any = None,
) -> None:
    db.add(CP4AuditLogRecord(
        handoff_id=handoff_id,
        client_id=client_id,
        action=action,
        actor=actor,
        before_state=before,
        after_state=after,
    ))
    db.commit()


def _record(db: Session, handoff_id: str) -> SalesHandoffRecord:
    record = db.query(SalesHandoffRecord).filter(SalesHandoffRecord.id == handoff_id).first()
    if record is None:
        raise CP4NotFoundError(handoff_id)
    return record


def create_handoff(
    *,
    client_id: str,
    account_domain: str,
    contact_id: str,
    tldr_text: str,
    engagement_score: int,
    triggering_events: list[HandoffTriggerEvent],
    db: Session,
    actor: str = "campaign_agent",
) -> SalesHandoffNote:
    """
    Idempotent on (client_id, account_domain, contact_id) for any non-terminal
    handoff. If a PENDING/ACCEPTED row exists for the same triple, return it
    unchanged — re-triggering should never produce duplicate CP4 rows.
    """
    existing = (
        db.query(SalesHandoffRecord)
        .filter(
            SalesHandoffRecord.client_id == client_id,
            SalesHandoffRecord.account_domain == account_domain,
            SalesHandoffRecord.contact_id == contact_id,
            SalesHandoffRecord.status.in_([CP4Status.PENDING.value, CP4Status.ACCEPTED.value]),
        )
        .first()
    )
    if existing is not None:
        return _to_note(existing)

    handoff_id = uuid.uuid4()
    note = SalesHandoffNote(
        handoff_id=handoff_id,
        client_id=uuid.UUID(client_id),
        account_domain=account_domain,
        contact_id=uuid.UUID(contact_id),
        tldr_text=tldr_text,
        engagement_score=engagement_score,
        triggering_events=triggering_events,
        status=CP4Status.PENDING,
        created_at=_now(),
        notify_sent_at=None,
        accepted_at=None,
        accepted_by=None,
        escalated_at=None,
        escalation_reason=None,
        rejected_at=None,
        rejection_reason=None,
    )
    record = SalesHandoffRecord(
        id=str(handoff_id),
        client_id=client_id,
        account_domain=account_domain,
        contact_id=contact_id,
        data={},
    )
    persisted = _persist(db, record, note)
    _audit(
        db,
        handoff_id=str(handoff_id),
        client_id=client_id,
        action="CREATE",
        actor=actor,
        after={"engagement_score": engagement_score, "triggering_events": len(triggering_events)},
    )
    return persisted


def notify_sales_exec(handoff_id: str, db: Session, *, actor: str = "campaign_agent") -> SalesHandoffNote:
    """Mark notify_sent_at exactly once. Subsequent calls are no-ops (returns existing state)."""
    record = _record(db, handoff_id)
    note = _to_note(record)
    if note.notify_sent_at is not None:
        return note
    if note.status != CP4Status.PENDING:
        raise CP4StateError(f"Cannot notify on handoff in status={note.status.value!r}")
    updated = note.model_copy(update={"notify_sent_at": _now()})
    persisted = _persist(db, record, updated)
    _audit(
        db,
        handoff_id=handoff_id,
        client_id=str(note.client_id),
        action="NOTIFY",
        actor=actor,
        after={"notify_sent_at": persisted.notify_sent_at.isoformat() if persisted.notify_sent_at else None},
    )
    return persisted


def get_handoff(handoff_id: str, db: Session) -> SalesHandoffNote:
    return _to_note(_record(db, handoff_id))


def list_handoffs(
    client_id: str,
    db: Session,
    *,
    status: Optional[CP4Status] = None,
) -> list[SalesHandoffNote]:
    query = db.query(SalesHandoffRecord).filter(SalesHandoffRecord.client_id == client_id)
    if status is not None:
        query = query.filter(SalesHandoffRecord.status == status.value)
    rows = query.order_by(SalesHandoffRecord.created_at.desc()).all()
    return [_to_note(row) for row in rows]


def summary(client_id: str, db: Session, *, now: Optional[datetime] = None) -> CP4HandoffSummary:
    notes = list_handoffs(client_id, db)
    overdue = sum(1 for n in notes if is_overdue(n, now=now))
    return CP4HandoffSummary(
        total=len(notes),
        pending=sum(1 for n in notes if n.status == CP4Status.PENDING),
        accepted=sum(1 for n in notes if n.status == CP4Status.ACCEPTED),
        rejected=sum(1 for n in notes if n.status == CP4Status.REJECTED),
        escalated=sum(1 for n in notes if n.status == CP4Status.ESCALATED),
        overdue_pending=overdue,
    )


def accept_handoff(handoff_id: str, accepted_by: str, db: Session) -> SalesHandoffNote:
    record = _record(db, handoff_id)
    note = _to_note(record)
    try:
        check_can_accept(note)
    except CP4Blocker as exc:
        raise CP4StateError(str(exc)) from exc
    updated = note.model_copy(update={
        "status": CP4Status.ACCEPTED,
        "accepted_at": _now(),
        "accepted_by": accepted_by,
    })
    persisted = _persist(db, record, updated)
    _audit(
        db,
        handoff_id=handoff_id,
        client_id=str(note.client_id),
        action="ACCEPT",
        actor=accepted_by,
        before={"status": note.status.value},
        after={"status": persisted.status.value},
    )
    db.add(EventRecord(
        client_id=str(note.client_id),
        event_type="cp4.accepted",
        payload={"handoff_id": handoff_id, "accepted_by": accepted_by},
    ))
    db.commit()
    return persisted


def reject_handoff(handoff_id: str, rejection_reason: str, rejected_by: str, db: Session) -> SalesHandoffNote:
    if not rejection_reason or not rejection_reason.strip():
        raise CP4StateError("rejection_reason is required")
    record = _record(db, handoff_id)
    note = _to_note(record)
    try:
        check_can_reject(note)
    except CP4Blocker as exc:
        raise CP4StateError(str(exc)) from exc
    updated = note.model_copy(update={
        "status": CP4Status.REJECTED,
        "rejected_at": _now(),
        "rejection_reason": rejection_reason,
    })
    persisted = _persist(db, record, updated)
    _audit(
        db,
        handoff_id=handoff_id,
        client_id=str(note.client_id),
        action="REJECT",
        actor=rejected_by,
        before={"status": note.status.value},
        after={"status": persisted.status.value, "reason": rejection_reason},
    )
    db.add(EventRecord(
        client_id=str(note.client_id),
        event_type="cp4.rejected",
        payload={"handoff_id": handoff_id, "rejected_by": rejected_by, "reason": rejection_reason},
    ))
    db.commit()
    return persisted


def escalate_overdue(
    client_id: str,
    db: Session,
    *,
    now: Optional[datetime] = None,
    actor: str = "scheduler",
) -> list[SalesHandoffNote]:
    """
    Sweep PENDING handoffs whose 24h SLA has elapsed and escalate them to the
    Operator. Designed to be called by an APScheduler/Celery beat job. Idempotent:
    re-running over the same set is a no-op because already-escalated rows are
    no longer PENDING.
    """
    rows = (
        db.query(SalesHandoffRecord)
        .filter(
            SalesHandoffRecord.client_id == client_id,
            SalesHandoffRecord.status == CP4Status.PENDING.value,
        )
        .all()
    )
    escalated: list[SalesHandoffNote] = []
    for record in rows:
        note = _to_note(record)
        if not is_overdue(note, now=now):
            continue
        updated = note.model_copy(update={
            "status": CP4Status.ESCALATED,
            "escalated_at": now or _now(),
            "escalation_reason": f"Sales Exec did not respond within {24}h of notify_sent_at",
        })
        persisted = _persist(db, record, updated)
        _audit(
            db,
            handoff_id=str(note.handoff_id),
            client_id=client_id,
            action="ESCALATE",
            actor=actor,
            before={"status": note.status.value},
            after={"status": persisted.status.value},
        )
        db.add(EventRecord(
            client_id=client_id,
            event_type="cp4.escalated",
            payload={"handoff_id": str(note.handoff_id), "reason": persisted.escalation_reason},
        ))
        db.commit()
        escalated.append(persisted)
    return escalated
