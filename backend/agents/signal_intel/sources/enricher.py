"""
LLM-based signal enricher.

Takes raw candidate content from any source and uses GPT to determine:
- Whether the item is a genuine buying signal (not just a keyword match)
- The correct signal type based on actual content semantics
- The intent level based on sentiment and context

A single batched LLM call is made per source per company to keep cost low.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass

import httpx

from backend.schemas.models import IntentLevel, MasterContext, SignalType

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL = os.environ.get("OPENAI_SIGNAL_MODEL", "gpt-4o-mini")
OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
_ENRICHER_TIMEOUT_SECS = float(os.environ.get("ENRICHER_TIMEOUT_SECS", "30.0"))
_ENRICHER_MAX_TOKENS = int(os.environ.get("ENRICHER_MAX_TOKENS", "1500"))

# Global cap on concurrent OpenAI enrichment calls across ALL sources and accounts.
# Without this, N accounts × 5 sources stampede OpenAI, calls queue behind rate
# limits, and per-call latency blows past the per-source fetch timeout.
_ENRICH_CONCURRENCY = int(os.environ.get("SIGNAL_INTEL_ENRICH_CONCURRENCY", "8"))
# Candidates per OpenAI call. Small batches classify faster, avoid output-token
# truncation, and rarely hit the read timeout.
_ENRICH_BATCH_SIZE = int(os.environ.get("SIGNAL_INTEL_ENRICH_BATCH_SIZE", "6"))
_enrich_sems: dict[object, asyncio.Semaphore] = {}


def _get_enrich_sem() -> asyncio.Semaphore:
    """Return a semaphore bound to the current running event loop."""
    loop = asyncio.get_running_loop()
    sem = _enrich_sems.get(loop)
    if sem is None:
        sem = asyncio.Semaphore(_ENRICH_CONCURRENCY)
        _enrich_sems[loop] = sem
    return sem

_VALID_TYPES = {t.value for t in SignalType}
_VALID_INTENTS = {i.value for i in IntentLevel}

_SYSTEM_PROMPT = """\
You are a senior B2B sales intelligence analyst. Classify signal candidates for a target account.
Return ONLY a JSON object: {"results": [...array...]}.
Each result: {"id": str, "is_relevant": bool, "signal_type": str|null, "intent_level": str|null, "reasoning": str}.
signal_type options: FUNDING, EXPANSION, LEADERSHIP_HIRE, RELEVANT_HIRE, COMPETITOR_REVIEW, EXEC_CONTENT.
intent_level options: HIGH, MEDIUM, LOW.
is_relevant: true if this item is reasonably related to the target company or its industry, market, or people.
Be INCLUSIVE — mark is_relevant=false only for clearly unrelated noise (e.g. wrong company, entirely different industry)."""

_USER_TEMPLATE = """\
Target company: {company_name}
ICP context: {icp_context}

Classify each candidate. For each:
- is_relevant: true if this content is FROM or ABOUT {company_name}, or describes their industry/market/people. \
Mark false ONLY for clearly unrelated content (entirely different company, completely different industry, spam).
- signal_type: the best-fit type, or null if unsure
- intent_level:
    HIGH = strong, direct signal (new funding round, C-suite hire, actively comparing competitors)
    MEDIUM = moderate signal (market expansion, relevant team-building, pain point discussion)
    LOW = weak or indirect (generic company page, low engagement, tangential topic)
- reasoning: one concise sentence

Candidates:
{candidates_json}"""


@dataclass
class RawCandidate:
    id: str
    content: str       # title + body or description — whatever the source has
    source_hint: str   # e.g. "news article", "job posting", "reddit post", "g2 review"


@dataclass
class EnrichedResult:
    id: str
    is_relevant: bool
    signal_type: SignalType | None
    intent_level: IntentLevel | None
    reasoning: str


def _build_icp_context(master_context: MasterContext) -> str:
    titles = ", ".join(master_context.buyers.titles[:5])
    pain_points = "; ".join(master_context.buyers.pain_points[:3])
    industries = ", ".join(master_context.icp.industries[:3])
    return f"Target buyers: {titles}. Industries: {industries}. Pain points: {pain_points}."


def _parse_result(raw: dict) -> EnrichedResult:
    sig_type_str = raw.get("signal_type")
    intent_str = raw.get("intent_level")
    return EnrichedResult(
        id=str(raw.get("id", "")),
        is_relevant=bool(raw.get("is_relevant", False)),
        signal_type=SignalType(sig_type_str) if sig_type_str in _VALID_TYPES else None,
        intent_level=IntentLevel(intent_str) if intent_str in _VALID_INTENTS else None,
        reasoning=str(raw.get("reasoning", "")),
    )


async def _enrich_batch(
    batch: list[RawCandidate],
    company_name: str,
    icp_context: str,
) -> list[EnrichedResult]:
    """Classify one small batch in a single OpenAI call. Falls back to marking all
    relevant on any error, preserving raw-source behavior."""
    candidates_json = json.dumps(
        [{"id": c.id, "type": c.source_hint, "content": c.content[:600]} for c in batch],
        ensure_ascii=False,
    )
    user_msg = _USER_TEMPLATE.format(
        company_name=company_name,
        icp_context=icp_context,
        candidates_json=candidates_json,
    )

    try:
        async with _get_enrich_sem(), httpx.AsyncClient(timeout=_ENRICHER_TIMEOUT_SECS) as client:
            resp = await client.post(
                OPENAI_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENAI_MODEL,
                    "max_tokens": _ENRICHER_MAX_TOKENS,
                    "messages": [
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "user", "content": user_msg},
                    ],
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            payload = resp.json()
            content = payload["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            raw_results = parsed.get("results", [])
            return [_parse_result(r) for r in raw_results if isinstance(r, dict)]

    except Exception as exc:
        logger.warning(
            "SignalEnricher: batch enrichment failed for company=%s (%d candidates): %r",
            company_name, len(batch), exc,
        )
        return [
            EnrichedResult(id=c.id, is_relevant=True, signal_type=None, intent_level=None, reasoning="LLM error")
            for c in batch
        ]


async def enrich_candidates(
    candidates: list[RawCandidate],
    company_name: str,
    master_context: MasterContext,
) -> list[EnrichedResult]:
    """
    Classify candidates via LLM. Large candidate lists are split into small batches
    that run concurrently (bounded by the global enrichment semaphore) — small calls
    are faster, avoid output-token truncation, and rarely hit the read timeout.
    Falls back to marking all relevant if OpenAI is unavailable.
    """
    if not candidates:
        return []

    if not OPENAI_API_KEY:
        logger.warning("SignalEnricher: OPENAI_API_KEY not set, skipping LLM enrichment")
        return [
            EnrichedResult(id=c.id, is_relevant=True, signal_type=None, intent_level=None, reasoning="LLM unavailable")
            for c in candidates
        ]

    icp_context = _build_icp_context(master_context)
    batches = [
        candidates[i:i + _ENRICH_BATCH_SIZE]
        for i in range(0, len(candidates), _ENRICH_BATCH_SIZE)
    ]
    batch_results = await asyncio.gather(
        *[_enrich_batch(b, company_name, icp_context) for b in batches]
    )
    results = [r for batch in batch_results for r in batch]

    relevant_count = sum(1 for r in results if r.is_relevant)
    logger.info(
        "SignalEnricher: company=%s — %d/%d candidates marked relevant (%d batch(es))",
        company_name, relevant_count, len(results), len(batches),
    )
    return results
