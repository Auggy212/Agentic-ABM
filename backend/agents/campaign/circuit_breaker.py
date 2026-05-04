from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from backend.db.models import CampaignAuditLogRecord, CampaignHaltRecord, OutboundSendRecord
from backend.schemas.models import HaltReason, HaltScope, SendStatus


BOUNCE_RATE_THRESHOLD = 0.05
BOUNCE_MIN_SAMPLES = 50
RESUME_TOKEN = "RESUME"


class InvalidResumeTokenError(Exception):
    """Raised when an operator-resume request omits the exact 'RESUME' token.
    Master prompt §3 anti-pattern: removing this friction is forbidden."""


class CampaignHaltedError(Exception):
    """Raised when CampaignAgent.run is attempted while a halt is active."""


@dataclass
class BounceStats:
    sent: int
    bounced: int

    @property
    def rate(self) -> float:
        return self.bounced / self.sent if self.sent else 0.0

    @property
    def trips_breaker(self) -> bool:
        return self.sent >= BOUNCE_MIN_SAMPLES and self.rate > BOUNCE_RATE_THRESHOLD


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _audit(db: Session, *, client_id: Optional[str], action: str, actor: str, after: dict | None = None) -> None:
    db.add(CampaignAuditLogRecord(client_id=client_id, action=action, actor=actor, after_state=after))
    db.commit()


def compute_bounce_stats(client_id: str, db: Session) -> BounceStats:
    rows = (
        db.query(OutboundSendRecord)
        .filter(OutboundSendRecord.client_id == client_id, OutboundSendRecord.channel == "EMAIL")
        .all()
    )
    sent = sum(1 for r in rows if r.status in (SendStatus.SENT.value, SendStatus.FAILED.value))
    bounced = sum(1 for r in rows if r.status == SendStatus.FAILED.value and (r.error_code or "").upper() == "BOUNCE")
    return BounceStats(sent=sent, bounced=bounced)


def is_halted(client_id: str, db: Session) -> Optional[CampaignHaltRecord]:
    """Returns the active halt (client-scoped or global) blocking this client, or None."""
    global_halt = (
        db.query(CampaignHaltRecord)
        .filter(CampaignHaltRecord.scope == HaltScope.GLOBAL.value, CampaignHaltRecord.resumed_at.is_(None))
        .first()
    )
    if global_halt is not None:
        return global_halt
    return (
        db.query(CampaignHaltRecord)
        .filter(
            CampaignHaltRecord.scope == HaltScope.CLIENT.value,
            CampaignHaltRecord.client_id == client_id,
            CampaignHaltRecord.resumed_at.is_(None),
        )
        .first()
    )


def assert_not_halted(client_id: str, db: Session) -> None:
    halt = is_halted(client_id, db)
    if halt is not None:
        raise CampaignHaltedError(f"Campaign halted (scope={halt.scope}, reason={halt.reason}): {halt.detail}")


def halt_client(client_id: str, *, reason: HaltReason, detail: str, triggered_by: str, db: Session) -> CampaignHaltRecord:
    existing = is_halted(client_id, db)
    if existing is not None and existing.scope == HaltScope.CLIENT.value:
        return existing
    record = CampaignHaltRecord(
        id=str(uuid.uuid4()),
        client_id=client_id,
        scope=HaltScope.CLIENT.value,
        reason=reason.value,
        detail=detail,
        triggered_at=_now(),
        triggered_by=triggered_by,
    )
    db.add(record)
    db.commit()
    _audit(db, client_id=client_id, action="HALT_CLIENT", actor=triggered_by, after={"reason": reason.value, "detail": detail})
    return record


def halt_global(*, reason: HaltReason, detail: str, triggered_by: str, db: Session) -> CampaignHaltRecord:
    existing = (
        db.query(CampaignHaltRecord)
        .filter(CampaignHaltRecord.scope == HaltScope.GLOBAL.value, CampaignHaltRecord.resumed_at.is_(None))
        .first()
    )
    if existing is not None:
        return existing
    record = CampaignHaltRecord(
        id=str(uuid.uuid4()),
        client_id=None,
        scope=HaltScope.GLOBAL.value,
        reason=reason.value,
        detail=detail,
        triggered_at=_now(),
        triggered_by=triggered_by,
    )
    db.add(record)
    db.commit()
    _audit(db, client_id=None, action="HALT_GLOBAL", actor=triggered_by, after={"reason": reason.value, "detail": detail})
    return record


def resume(*, halt_id: str, confirmation_token: str, resumed_by: str, db: Session) -> CampaignHaltRecord:
    """Resume a halt. Confirmation token MUST equal exactly 'RESUME' (case-sensitive).
    Master prompt §3: the friction is the safety mechanism — do not weaken."""
    if confirmation_token != RESUME_TOKEN:
        raise InvalidResumeTokenError("confirmation token must be exactly 'RESUME'")
    record = db.query(CampaignHaltRecord).filter(CampaignHaltRecord.id == halt_id).first()
    if record is None:
        raise ValueError(f"halt {halt_id!r} not found")
    if record.resumed_at is not None:
        return record
    record.resumed_at = _now()
    record.resumed_by = resumed_by
    db.add(record)
    db.commit()
    _audit(db, client_id=record.client_id, action=f"RESUME_{record.scope}", actor=resumed_by, after={"halt_id": halt_id})
    return record


def evaluate_bounce(client_id: str, db: Session, *, triggered_by: str = "circuit_breaker") -> Optional[CampaignHaltRecord]:
    """Evaluate the bounce circuit breaker after each EMAIL send. Halts the client
    when bounce_rate > 5% AND total_sends_attempted >= 50."""
    stats = compute_bounce_stats(client_id, db)
    if not stats.trips_breaker:
        return None
    detail = f"bounce_rate={stats.rate:.3f} sent={stats.sent} bounced={stats.bounced}"
    return halt_client(
        client_id,
        reason=HaltReason.BOUNCE_CIRCUIT_BREAKER,
        detail=detail,
        triggered_by=triggered_by,
        db=db,
    )
