from __future__ import annotations

import os
import re
from dataclasses import dataclass
from enum import Enum
from typing import Protocol


class ReplyLabel(str, Enum):
    POSITIVE = "POSITIVE"
    NEGATIVE = "NEGATIVE"
    QUESTION = "QUESTION"
    MEETING_REQUEST = "MEETING_REQUEST"
    NEUTRAL = "NEUTRAL"


@dataclass(frozen=True)
class ReplyClassification:
    label: ReplyLabel
    confidence: float
    source: str  # "claude" | "regex_fallback" | "mock"


# Keyword sets for the regex fallback. Intentionally simple — fallback exists
# precisely so the system stays safe when budget/cache cannot reach the LLM.
_NEGATIVE_PATTERNS = re.compile(
    r"\b(unsubscribe|stop|remove me|not interested|do not contact|do not email|leave me alone|"
    r"go away|no thanks|no thank you|fuck off|piss off)\b",
    re.IGNORECASE,
)
_MEETING_PATTERNS = re.compile(
    r"\b(book(?:\s+a)?\s+(?:meeting|call|demo)|set\s+up\s+a\s+(?:call|meeting)|calendly|"
    r"schedule\s+(?:a\s+)?(?:call|meeting|demo)|let'?s\s+(?:chat|meet|connect)|grab\s+time)\b",
    re.IGNORECASE,
)
_QUESTION_PATTERNS = re.compile(r"\?")
_POSITIVE_PATTERNS = re.compile(
    r"\b(interested|sounds good|tell me more|yes please|love to|let's do it|happy to)\b",
    re.IGNORECASE,
)


def regex_classify(text: str) -> ReplyClassification:
    """Cheap, deterministic fallback. Prefers safety: any negative wins."""
    if _NEGATIVE_PATTERNS.search(text):
        return ReplyClassification(ReplyLabel.NEGATIVE, confidence=0.6, source="regex_fallback")
    if _MEETING_PATTERNS.search(text):
        return ReplyClassification(ReplyLabel.MEETING_REQUEST, confidence=0.6, source="regex_fallback")
    if _POSITIVE_PATTERNS.search(text):
        return ReplyClassification(ReplyLabel.POSITIVE, confidence=0.55, source="regex_fallback")
    if _QUESTION_PATTERNS.search(text):
        return ReplyClassification(ReplyLabel.QUESTION, confidence=0.5, source="regex_fallback")
    return ReplyClassification(ReplyLabel.NEUTRAL, confidence=0.4, source="regex_fallback")


class ReplyCache(Protocol):
    def get(self, key: str) -> ReplyClassification | None: ...
    def set(self, key: str, value: ReplyClassification) -> None: ...


class InMemoryReplyCache:
    """Default cache for tests. Swap with Redis-backed impl in production."""

    def __init__(self) -> None:
        self._store: dict[str, ReplyClassification] = {}

    def get(self, key: str) -> ReplyClassification | None:
        return self._store.get(key)

    def set(self, key: str, value: ReplyClassification) -> None:
        self._store[key] = value


class ReplyBudget:
    """Per-day USD budget for the LLM classifier. Live calls call .consume(cost)
    and check .exhausted before spending."""

    def __init__(self, daily_budget_usd: float) -> None:
        self.daily_budget_usd = daily_budget_usd
        self.spent_usd = 0.0

    @property
    def exhausted(self) -> bool:
        return self.spent_usd >= self.daily_budget_usd

    def consume(self, cost_usd: float) -> None:
        self.spent_usd += cost_usd


def classify(
    text: str,
    *,
    cache: ReplyCache | None = None,
    budget: ReplyBudget | None = None,
    use_mock: bool | None = None,
) -> ReplyClassification:
    """
    Master prompt §5: cache by hash(text) (24h TTL), per-day USD budget cap,
    on exhaust fall back to regex but ALWAYS pause the contact downstream.

    Mock mode (default for tests) routes everything through the regex
    classifier — same code path the live build falls back to.
    """
    cache = cache or InMemoryReplyCache()
    key = f"reply:{hash(text)}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    if use_mock is None:
        use_mock = os.environ.get("REPLY_CLASSIFIER_USE_MOCK", "1") == "1"

    if use_mock or budget is None or budget.exhausted:
        result = regex_classify(text)
    else:
        # Live Claude path goes here. Wiring deferred to Phase 5b. For now
        # we route to regex and consume nothing — keeps tests deterministic.
        result = regex_classify(text)

    cache.set(key, result)
    return result
