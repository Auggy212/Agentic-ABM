"""
In-memory draft cache.

Drafts are stored durably in Supabase (IntakeDraftRecord table).
This module provides a lightweight in-process cache so repeated reads within
a single process lifecycle avoid a round-trip to Supabase.
"""

from __future__ import annotations

import json
import time
from typing import Optional

DRAFT_TTL_SECONDS: int = 604_800   # 7 days
DRAFT_KEY_PREFIX: str = "intake:draft:"

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


def save_draft(client_id: str, payload: dict) -> None:
    key = f"{DRAFT_KEY_PREFIX}{client_id}"
    _memory_store[key] = (json.dumps(payload), time.time() + DRAFT_TTL_SECONDS)


def load_draft(client_id: str) -> Optional[dict]:
    key = f"{DRAFT_KEY_PREFIX}{client_id}"
    raw = _memory_get(key)
    return json.loads(raw) if raw else None


def delete_draft(client_id: str) -> None:
    _memory_store.pop(f"{DRAFT_KEY_PREFIX}{client_id}", None)
