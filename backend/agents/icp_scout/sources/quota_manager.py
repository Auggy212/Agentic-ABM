"""
Quota-aware wrapper for ICP Scout data sources.

Tracks per-source monthly usage in Redis (key: quota:{source}:{client_id}:{yyyymm}).
Before every source call the caller must invoke check_and_increment(); this
raises QuotaExhaustedError if the source's limit is reached.

Limits are read from environment variables so they can be tuned per deployment:
  QUOTA_LIMIT_APOLLO      (default 50   — free tier; raise for paid plans)
  QUOTA_LIMIT_HARMONIC    (default 100  — conservative estimate)
  QUOTA_LIMIT_CRUNCHBASE  (default 200  — Crunchbase Basic)
  QUOTA_LIMIT_BUILTWITH   (default 100  — BuiltWith free tier)
Set any value to -1 for unlimited.

Critical: DO NOT fail silently on quota exhaustion. Surface it as a warning
in the final response so the Operator knows discovery was partial.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import date, timezone, datetime
from typing import Any, Optional

import redis

from backend.schemas.models import DataSource

logger = logging.getLogger(__name__)

REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379")

# Default monthly limits — override via env vars per above docstring.
_DEFAULTS: dict[str, int] = {
    DataSource.APOLLO.value:        50,
    DataSource.HARMONIC.value:      100,
    DataSource.CRUNCHBASE.value:    200,
    DataSource.BUILTWITH.value:     100,
    DataSource.CLIENT_UPLOAD.value: -1,
}

_ENV_KEYS: dict[str, str] = {
    DataSource.APOLLO.value:     "QUOTA_LIMIT_APOLLO",
    DataSource.HARMONIC.value:   "QUOTA_LIMIT_HARMONIC",
    DataSource.CRUNCHBASE.value: "QUOTA_LIMIT_CRUNCHBASE",
    DataSource.BUILTWITH.value:  "QUOTA_LIMIT_BUILTWITH",
}


def _get_limit(source: str) -> int:
    env_key = _ENV_KEYS.get(source)
    if env_key:
        raw = os.environ.get(env_key)
        if raw is not None:
            try:
                return int(raw)
            except ValueError:
                logger.warning("quota_manager: invalid %s=%r — using default", env_key, raw)
    return _DEFAULTS.get(source, -1)


# Build the effective limits dict at import time for backward-compat callers.
SOURCE_MONTHLY_LIMITS: dict[str, int] = {src: _get_limit(src) for src in _DEFAULTS}

QUOTA_KEY_PREFIX = "quota:"
QUOTA_TTL_SECONDS = 60 * 60 * 24 * 32   # ~32 days, safely past end of any month

# Sentinel used when no client_id is available (e.g. tests)
_NO_CLIENT = "shared"


class QuotaExhaustedError(Exception):
    """
    Raised before a source call when the monthly quota has been reached.

    Attributes:
        source       — DataSource enum value that is exhausted
        used         — how many calls have been made this month
        limit        — the configured monthly limit
        reset_date   — first day of next month (when the counter resets)
        recommended  — human-readable action for the Operator
    """
    def __init__(
        self,
        source: str,
        used: int,
        limit: int,
        reset_date: date,
    ) -> None:
        self.source = source
        self.used = used
        self.limit = limit
        self.reset_date = reset_date
        self.recommended = (
            f"Upgrade {source} plan OR wait until {reset_date.isoformat()} (UTC) "
            f"when the monthly quota resets."
        )
        super().__init__(
            f"Quota exhausted for {source}: used {used}/{limit}. {self.recommended}"
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "used": self.used,
            "limit": self.limit,
            "reset_date": self.reset_date.isoformat(),
            "recommended_action": self.recommended,
        }


class ConfigurationError(Exception):
    """Raised when a required API key or critical config value is missing."""


def _quota_key(source: str, yyyymm: str, client_id: str = _NO_CLIENT) -> str:
    return f"{QUOTA_KEY_PREFIX}{source}:{client_id}:{yyyymm}"


def _current_yyyymm() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y%m")


def _next_month_first_day() -> date:
    today = date.today()
    if today.month == 12:
        return date(today.year + 1, 1, 1)
    return date(today.year, today.month + 1, 1)


def _get_redis() -> redis.Redis:
    return redis.from_url(REDIS_URL, decode_responses=True)


def get_usage(source: str, yyyymm: Optional[str] = None, client_id: str = _NO_CLIENT) -> int:
    """Return current month's usage count for a source. Returns 0 on Redis error."""
    yyyymm = yyyymm or _current_yyyymm()
    try:
        r = _get_redis()
        val = r.get(_quota_key(source, yyyymm, client_id))
        return int(val) if val else 0
    except Exception:
        logger.debug("quota_manager: Redis unavailable — treating usage as 0 for %s", source)
        return 0


def check_and_increment(source: str, client_id: str = _NO_CLIENT) -> int:
    """
    Check quota for source and increment the counter atomically.

    Returns the new usage count after incrementing.
    Raises QuotaExhaustedError BEFORE incrementing if the limit is already reached.
    If Redis is unavailable, logs a warning and allows the call (fail-open).

    Pass client_id to track quota per-tenant; defaults to shared global counter.
    """
    limit = _get_limit(source)
    if limit == -1:
        return 0  # unlimited

    yyyymm = _current_yyyymm()
    key = _quota_key(source, yyyymm, client_id)

    try:
        r = _get_redis()
        current = int(r.get(key) or 0)

        if current >= limit:
            reset = _next_month_first_day()
            logger.warning(
                "quota_manager: %s quota exhausted (%d/%d) client=%s reset=%s (UTC)",
                source, current, limit, client_id, reset.isoformat(),
            )
            raise QuotaExhaustedError(source, current, limit, reset)

        # Warn at 80% usage
        if current >= limit * 0.8:
            logger.warning(
                "quota_manager: %s at %.0f%% quota (%d/%d) client=%s",
                source, 100 * current / limit, current, limit, client_id,
            )

        new_count = r.incr(key)
        # Set TTL on first write so the key auto-expires
        if new_count == 1:
            r.expire(key, QUOTA_TTL_SECONDS)

        logger.debug("quota_manager: %s usage %d/%d client=%s", source, new_count, limit, client_id)
        return new_count

    except QuotaExhaustedError:
        raise
    except Exception as exc:
        logger.debug(
            "quota_manager: Redis unavailable for %s (%s) — allowing call (fail-open)", source, exc
        )
        return 0


def reset_usage(source: str, yyyymm: Optional[str] = None, client_id: str = _NO_CLIENT) -> None:
    """Delete the quota counter for a source+month. Used in tests."""
    yyyymm = yyyymm or _current_yyyymm()
    try:
        r = _get_redis()
        r.delete(_quota_key(source, yyyymm, client_id))
    except Exception:
        pass


def set_usage(source: str, count: int, yyyymm: Optional[str] = None, client_id: str = _NO_CLIENT) -> None:
    """Force-set a usage count. Used in tests to simulate exhaustion."""
    yyyymm = yyyymm or _current_yyyymm()
    try:
        r = _get_redis()
        key = _quota_key(source, yyyymm, client_id)
        r.set(key, count)
        r.expire(key, QUOTA_TTL_SECONDS)
    except Exception:
        pass
