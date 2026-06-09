"""
LLM-based signal enricher.

Takes raw candidate content from any source and uses GPT to determine:
- Whether the item is a genuine buying signal (not just a keyword match)
- The correct signal type based on actual content semantics
- The intent level based on sentiment and context

A single batched LLM call is made per source per company to keep cost low.
"""

from __future__ import annotations

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

_VALID_TYPES = {t.value for t in SignalType}
_VALID_INTENTS = {i.value for i in IntentLevel}

_SYSTEM_PROMPT = """\
You are a senior B2B sales intelligence analyst. Classify signal candidates for a target account.
Return ONLY a JSON object: {"results": [...array...]}.
Each result: {"id": str, "is_relevant": bool, "signal_type": str|null, "intent_level": str|null, "reasoning": str}.
signal_type options: FUNDING, EXPANSION, LEADERSHIP_HIRE, RELEVANT_HIRE, COMPETITOR_REVIEW, EXEC_CONTENT.
intent_level options: HIGH, MEDIUM, LOW.
is_relevant: true only if this item genuinely indicates buying intent or a meaningful change at the target company."""

_USER_TEMPLATE = """\
Target company: {company_name}
ICP context: {icp_context}

Classify each candidate. For each:
- is_relevant: true if this is a genuine buying signal specific to {company_name} (not generic noise)
- signal_type: the best-fit type, or null if not relevant
- intent_level:
    HIGH = strong, direct signal (new funding round, C-suite hire, actively comparing competitors)
    MEDIUM = moderate signal (market expansion, relevant team-building, pain point discussion)
    LOW = weak or indirect (generic mention, low engagement, tangential topic)
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


async def enrich_candidates(
    candidates: list[RawCandidate],
    company_name: str,
    master_context: MasterContext,
) -> list[EnrichedResult]:
    """
    Classify candidates via LLM. Falls back to marking all relevant (preserving
    raw-source behavior) if OpenAI is unavailable.
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
    candidates_json = json.dumps(
        [{"id": c.id, "type": c.source_hint, "content": c.content[:600]} for c in candidates],
        ensure_ascii=False,
    )

    user_msg = _USER_TEMPLATE.format(
        company_name=company_name,
        icp_context=icp_context,
        candidates_json=candidates_json,
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                OPENAI_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": OPENAI_MODEL,
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
        logger.warning("SignalEnricher: LLM enrichment failed: %s", exc)
        return [
            EnrichedResult(id=c.id, is_relevant=True, signal_type=None, intent_level=None, reasoning="LLM error")
            for c in candidates
        ]
