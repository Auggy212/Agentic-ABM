from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy.orm import Session

from backend.agents.campaign.transports.base import QuotaExhaustedError
from backend.db.models import QuotaCounterRecord


WindowKind = Literal["monthly", "daily"]


@dataclass(frozen=True)
class QuotaSpec:
    source: str
    limit: int
    window: WindowKind


# Free-tier ceilings per master prompt §3. Adjust here only when tier changes.
DEFAULT_QUOTAS: dict[str, QuotaSpec] = {
    "INSTANTLY": QuotaSpec("INSTANTLY", limit=10000, window="monthly"),  # paid; documented for parity
    "PHANTOMBUSTER": QuotaSpec("PHANTOMBUSTER", limit=240, window="daily"),  # ~2 hr/day @ ~30s/profile
    "TWILIO": QuotaSpec("TWILIO", limit=10000, window="monthly"),
    "APOLLO": QuotaSpec("APOLLO", limit=50, window="monthly"),
    "HUNTER": QuotaSpec("HUNTER", limit=25, window="monthly"),
    "NEVERBOUNCE": QuotaSpec("NEVERBOUNCE", limit=1000, window="monthly"),
}


def _window_key(kind: WindowKind, *, now: datetime | None = None) -> str:
    current = now or datetime.now(tz=timezone.utc)
    return current.strftime("%Y%m") if kind == "monthly" else current.strftime("%Y%m%d")


class QuotaManager:
    """SQL-backed quota counters. A Redis backend can be swapped in later
    behind the same interface; tests use the SQL path for determinism."""

    def __init__(self, db: Session, *, quotas: dict[str, QuotaSpec] | None = None) -> None:
        self.db = db
        self.quotas = quotas or DEFAULT_QUOTAS

    def _get_or_create(self, source: str, *, now: datetime | None = None) -> QuotaCounterRecord:
        spec = self.quotas[source]
        window = _window_key(spec.window, now=now)
        record = (
            self.db.query(QuotaCounterRecord)
            .filter(QuotaCounterRecord.source == source, QuotaCounterRecord.window == window)
            .first()
        )
        if record is None:
            record = QuotaCounterRecord(source=source, window=window, used=0, limit_value=spec.limit)
            self.db.add(record)
            self.db.commit()
            self.db.refresh(record)
        return record

    def check(self, source: str, *, now: datetime | None = None) -> None:
        if source not in self.quotas:
            return
        record = self._get_or_create(source, now=now)
        if record.used >= record.limit_value:
            raise QuotaExhaustedError(source, f"used={record.used}/{record.limit_value} window={record.window}")

    def consume(self, source: str, n: int = 1, *, now: datetime | None = None) -> None:
        if source not in self.quotas:
            return
        record = self._get_or_create(source, now=now)
        record.used += n
        self.db.add(record)
        self.db.commit()
        if record.used > record.limit_value:
            raise QuotaExhaustedError(source, f"used={record.used}/{record.limit_value} window={record.window}")

    def remaining(self, source: str, *, now: datetime | None = None) -> int:
        if source not in self.quotas:
            return 0
        record = self._get_or_create(source, now=now)
        return max(record.limit_value - record.used, 0)
