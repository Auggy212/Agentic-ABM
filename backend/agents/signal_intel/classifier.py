"""
Hybrid buying-stage classifier.

classify_buying_stage(signals) -> (BuyingStage, BuyingStageMethod, reasoning)

Rule-based first pass:
  0 signals                    → UNAWARE (RULES)
  Only LOW signals, count ≤ 2  → PROBLEM_AWARE (RULES)
  MEDIUM signals + 0 HIGH, 2–3 total → SOLUTION_AWARE (RULES)
  1 HIGH, no others            → SOLUTION_AWARE (RULES)
  2+ HIGH signals              → READY_TO_BUY (RULES)
  Anything else                → AMBIGUOUS → LLM tiebreaker

LLM tiebreaker results are cached in Redis for 24 hrs (same signal set → same answer).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from typing import Optional

import httpx

from backend.schemas.models import (
    AccountSignal,
    BuyingStage,
    BuyingStageMethod,
    IntentLevel,
)

logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-6"
_CACHE_TTL_SECONDS = 86400  # 24 hours

_SYSTEM_PROMPT = """You are classifying a B2B account's buying stage based on observed signals.
Choose ONE of: UNAWARE, PROBLEM_AWARE, SOLUTION_AWARE, EVALUATING, READY_TO_BUY.
Definitions:
- UNAWARE: no observable interest in the problem space
- PROBLEM_AWARE: acknowledging a pain but not actively shopping
- SOLUTION_AWARE: aware solutions exist, exploring options
- EVALUATING: actively comparing vendors, demoing, reading reviews
- READY_TO_BUY: budget unlocked, decision imminent

Return strict JSON only: {"stage": "<one>", "reasoning": "<one sentence>"}"""


def _signal_hash(signals: list[AccountSignal]) -> str:
    sig_data = sorted(
        [(s.type.value, s.intent_level.value, s.description[:50]) for s in signals]
    )
    return hashlib.sha256(json.dumps(sig_data).encode()).hexdigest()[:16]


def _get_redis():
    try:
        from backend.db.redis_client import get_redis_client
        return get_redis_client()
    except Exception:
        return None


def _cache_get(key: str) -> Optional[dict]:
    r = _get_redis()
    if not r:
        return None
    try:
        val = r.get(key)
        return json.loads(val) if val else None
    except Exception:
        return None


def _cache_set(key: str, value: dict) -> None:
    r = _get_redis()
    if not r:
        return
    try:
        r.setex(key, _CACHE_TTL_SECONDS, json.dumps(value))
    except Exception:
        pass


def _count_by_intent(signals: list[AccountSignal]) -> tuple[int, int, int]:
    high = sum(1 for s in signals if s.intent_level == IntentLevel.HIGH)
    medium = sum(1 for s in signals if s.intent_level == IntentLevel.MEDIUM)
    low = sum(1 for s in signals if s.intent_level == IntentLevel.LOW)
    return high, medium, low


def _rules_pass(signals: list[AccountSignal]) -> tuple[Optional[BuyingStage], str]:
    """Returns (stage, reasoning) or (None, '') if AMBIGUOUS."""
    total = len(signals)
    high, medium, low = _count_by_intent(signals)

    if total == 0:
        return BuyingStage.UNAWARE, "0 signals detected — no observable buying activity."

    if high == 0 and medium == 0 and low <= 2:
        return BuyingStage.PROBLEM_AWARE, f"{low} LOW signal(s) only — awareness of pain, not actively shopping."

    if high == 0 and medium >= 1 and total in (2, 3):
        return BuyingStage.SOLUTION_AWARE, f"{medium} MEDIUM signal(s), 0 HIGH — exploring solutions but no strong commitment."

    if high == 1 and medium == 0 and low == 0:
        return BuyingStage.SOLUTION_AWARE, "1 HIGH signal alone — notable but insufficient for EVALUATING/READY_TO_BUY."

    if high >= 2:
        return BuyingStage.READY_TO_BUY, f"{high} HIGH signals — strong buying intent, decision likely imminent."

    return None, ""  # AMBIGUOUS


async def _llm_tiebreaker(signals: list[AccountSignal]) -> tuple[BuyingStage, str]:
    """Calls Claude to resolve ambiguous signal combinations."""
    cache_key = f"classifier:{_signal_hash(signals)}"
    cached = _cache_get(cache_key)
    if cached:
        logger.info("classify_buying_stage: cache hit for hash=%s", cache_key[-8:])
        return BuyingStage(cached["stage"]), cached["reasoning"]

    if not ANTHROPIC_API_KEY:
        logger.warning("classify_buying_stage: ANTHROPIC_API_KEY not set, defaulting to SOLUTION_AWARE")
        return BuyingStage.SOLUTION_AWARE, "LLM tiebreaker unavailable — defaulted to SOLUTION_AWARE."

    signals_json = json.dumps([
        {
            "type": s.type.value,
            "intent_level": s.intent_level.value,
            "description": s.description[:100],
        }
        for s in signals
    ])

    user_message = f"Signals observed: {signals_json}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": CLAUDE_MODEL,
                    "max_tokens": 150,
                    "system": _SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": user_message}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            text = data["content"][0]["text"].strip()

            result = json.loads(text)
            stage = BuyingStage(result["stage"])
            reasoning = result.get("reasoning", "LLM tiebreaker classification.")

            _cache_set(cache_key, {"stage": stage.value, "reasoning": reasoning})
            logger.info("classify_buying_stage: LLM → %s (cached as %s)", stage.value, cache_key[-8:])
            return stage, reasoning

    except Exception as exc:
        logger.error("classify_buying_stage: LLM tiebreaker failed: %s", exc)
        return BuyingStage.SOLUTION_AWARE, f"LLM tiebreaker failed ({exc!s:.60}); defaulted to SOLUTION_AWARE."


async def classify_buying_stage(
    signals: list[AccountSignal],
) -> tuple[BuyingStage, BuyingStageMethod, str]:
    """
    Classify buying stage using hybrid rule-based + LLM tiebreaker approach.

    Returns:
        (BuyingStage, BuyingStageMethod, reasoning_string)
    """
    stage, reasoning = _rules_pass(signals)
    if stage is not None:
        return stage, BuyingStageMethod.RULES, reasoning

    # AMBIGUOUS — fire LLM tiebreaker
    stage, reasoning = await _llm_tiebreaker(signals)
    return stage, BuyingStageMethod.LLM_TIEBREAKER, reasoning


_OUTREACH_APPROACHES: dict[BuyingStage, str] = {
    BuyingStage.UNAWARE: (
        "Lead with education and thought leadership. Share insights about the problem space "
        "before pitching — they don't know they need you yet."
    ),
    BuyingStage.PROBLEM_AWARE: (
        "Acknowledge the pain with specific evidence. Use case studies from similar companies. "
        "Position as a trusted advisor, not a vendor."
    ),
    BuyingStage.SOLUTION_AWARE: (
        "Differentiate on your unique strengths vs. alternatives. Offer a proof-of-concept or "
        "ROI calculator. Invite them to a focused demo."
    ),
    BuyingStage.EVALUATING: (
        "Move fast — they're comparing vendors now. Lead with competitive differentiators, "
        "reference customers, and a clear success plan. Push for a champion."
    ),
    BuyingStage.READY_TO_BUY: (
        "Streamline the path to close. Offer commercial flexibility, a rapid implementation plan, "
        "and legal/security docs upfront. Engage the DECISION_MAKER directly."
    ),
}


def get_outreach_approach(stage: BuyingStage) -> str:
    return _OUTREACH_APPROACHES.get(stage, "Tailor outreach based on observed signals.")
