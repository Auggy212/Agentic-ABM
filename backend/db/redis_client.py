"""
Redis client for draft persistence.

Gracefully degrades to a simple in-process dict when Redis is unavailable
(e.g. local dev without Docker). Drafts are lost on process restart in that
mode, but the app keeps running.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Optional

logger = logging.getLogger(__name__)

REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379")
DRAFT_TTL_SECONDS: int = 604_800   # 7 days
DRAFT_KEY_PREFIX: str = "intake:draft:"

# --------------------------------------------------------------------------
# In-process fallback store
# --------------------------------------------------------------------------

_memory_store: dict[str, tuple[str, float]] = {}   # key -> (value, expires_at)


def _memory_get(key: str) -> Optional[str]:
    entry = _memory_store.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if time.time() > expires_at:
        _memory_store.pop(key, None)
        return None
    return value


def _memory_set(key: str, ttl: int, value: str) -> None:
    _memory_store[key] = (value, time.time() + ttl)


def _memory_delete(key: str) -> None:
    _memory_store.pop(key, None)


# --------------------------------------------------------------------------
# Redis client — lazy, with fallback on every call
# --------------------------------------------------------------------------

def _get_client():
    import redis  # type: ignore
    return redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2)


def save_draft(client_id: str, payload: dict) -> None:
    key = f"{DRAFT_KEY_PREFIX}{client_id}"
    serialised = json.dumps(payload)
    try:
        _get_client().setex(key, DRAFT_TTL_SECONDS, serialised)
    except Exception:
        logger.warning("Redis unavailable — saving draft for %s in memory", client_id)
        _memory_set(key, DRAFT_TTL_SECONDS, serialised)


def load_draft(client_id: str) -> Optional[dict]:
    key = f"{DRAFT_KEY_PREFIX}{client_id}"
    try:
        raw: Optional[str] = _get_client().get(key)
    except Exception:
        logger.warning("Redis unavailable — loading draft for %s from memory", client_id)
        raw = _memory_get(key)
    if raw is None:
        return None
    return json.loads(raw)


def delete_draft(client_id: str) -> None:
    key = f"{DRAFT_KEY_PREFIX}{client_id}"
    try:
        _get_client().delete(key)
    except Exception:
        logger.warning("Redis unavailable — deleting draft for %s from memory", client_id)
        _memory_delete(key)
