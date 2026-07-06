"""
Tier 1 Account Intelligence Report builder.

Single-stage pipeline using OpenAI only:
  - gpt-4o-mini researches and synthesizes the intel report in one call.
  - Every claim is tagged [VERIFIED] or [INFERRED].
  - The Verifier (Phase 3) blocks anything without a tag.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

import httpx

from backend.schemas.models import (
    AccountSignal,
    BuyerIntelPackage,
    CompetitiveLandscapeEntry,
    EvidenceStatus,
    GeneratedBy,
    IntelInferredPainPoint,
    IntelReport,
    MasterContext,
    RecentNewsItem,
    StrategicPriority,
)

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
OPENAI_MODEL = os.environ.get("OPENAI_INTEL_MODEL", "gpt-4o-mini")

_INTEL_SCHEMA_SUMMARY = """{
  "company_snapshot": "string — narrative paragraph, every claim tagged [VERIFIED] or [INFERRED]",
  "strategic_priorities": [{"priority": "str", "evidence": "str", "evidence_status": "VERIFIED|INFERRED", "source_url": "str"}],
  "tech_stack": ["string"],
  "competitive_landscape": [{"competitor_name": "str", "evidence": "str", "evidence_status": "VERIFIED|INFERRED", "source_url": "str"}],
  "inferred_pain_points": [{"pain_point": "str", "evidence_status": "INFERRED", "reasoning": "str"}],
  "recent_news": [{"headline": "str", "date": "YYYY-MM-DD", "source_url": "str", "summary": "str"}],
  "buying_committee_summary": "string",
  "recommended_angle": "string"
}"""

_SYSTEM_PROMPT = f"""You are an ABM intelligence analyst. Given a target company and context, produce a structured Account Intelligence Report grounded in publicly known facts and explicit inference.

TAGGING RULE — every factual claim must carry one of two inline tags:
  [VERIFIED]  = widely known, publicly documented fact (e.g. IPO date, published headcount, named acquisition)
  [INFERRED]  = your reasoned analysis based on patterns, role, industry, or signal data

Example of correct company_snapshot:
  "Acme Corp [VERIFIED] went public in 2021 and operates in 32 countries [VERIFIED]. Their recent \
hiring surge in data engineering [INFERRED] suggests a push toward self-serve analytics. \
The appointment of a new CISO [VERIFIED] likely signals a security compliance initiative [INFERRED]."

Omitting tags on ANY claim is a failure mode. Hedge inferences explicitly.

Return ONLY valid JSON matching this schema:
{_INTEL_SCHEMA_SUMMARY}

Constraints:
- recent_news: max 3 items, dates in YYYY-MM-DD format; only include events you are confident actually occurred
- inferred_pain_points: evidence_status MUST be "INFERRED" for every entry
- source_url: real known URL if you know it, otherwise "not_found"
- company_snapshot: 2-3 sentences, every claim tagged inline
- strategic_priorities: max 5 items
- competitive_landscape: max 5 items"""


async def _openai_generate(
    company_name: str,
    domain: str,
    buyer_intel: BuyerIntelPackage | None,
    master_context: MasterContext,
    signals: list[AccountSignal] | None = None,
) -> dict | None:
    """Generate the full intel report in one OpenAI call. Retries once on failure."""
    if not OPENAI_API_KEY:
        logger.warning("IntelReport: OPENAI_API_KEY not set — cannot generate report")
        return None

    buyer_summary = ""
    if buyer_intel and domain in buyer_intel.accounts:
        contacts = buyer_intel.accounts[domain]
        roles_summary = ", ".join(
            f"{c.full_name} ({c.committee_role.value})"
            for c in contacts[:5]
        )
        buyer_summary = f"\nBuying committee at this account: {roles_summary}"

    signals_summary = ""
    if signals:
        top = sorted(signals, key=lambda s: s.intent_level.value, reverse=True)[:5]
        lines = [f"- [{s.intent_level.value}] {s.type.value}: {s.description[:120]}" for s in top]
        signals_summary = "\nObserved buying signals (use to inform strategic_priorities and inferred_pain_points):\n" + "\n".join(lines)

    user_message = f"""Target account: {company_name} (domain: {domain})
Client company (your client selling to this account): {master_context.company.name}
Client ICP industries: {', '.join(master_context.icp.industries[:3])}
Competitors tracked by client: {', '.join(c.name for c in master_context.competitors[:3])}
Buyer pain points the client solves: {', '.join(master_context.buyers.pain_points[:3])}{buyer_summary}{signals_summary}

Using your knowledge of {company_name} and the signals above, produce the Account Intelligence Report JSON now."""

    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    OPENAI_URL,
                    headers={
                        "Authorization": f"Bearer {OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": OPENAI_MODEL,
                        "max_tokens": 2500,
                        "temperature": 0.3,
                        "messages": [
                            {"role": "system", "content": _SYSTEM_PROMPT},
                            {"role": "user", "content": user_message},
                        ],
                        "response_format": {"type": "json_object"},
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                text = data["choices"][0]["message"]["content"].strip()
                return json.loads(text)

        except json.JSONDecodeError as exc:
            logger.warning("IntelReport: invalid JSON from OpenAI (attempt %d): %s", attempt + 1, exc)
            return None  # retrying won't fix a malformed response
        except Exception as exc:
            logger.error("IntelReport: OpenAI call failed (attempt %d): %s", attempt + 1, exc)
            if attempt == 1:
                return None

    return None


def _build_intel_report(raw: dict, company_name: str) -> IntelReport | None:
    """Parse OpenAI's JSON output into an IntelReport Pydantic model."""
    try:
        strategic_priorities = [
            StrategicPriority(
                priority=item.get("priority", ""),
                evidence=item.get("evidence", ""),
                evidence_status=EvidenceStatus(item.get("evidence_status", "INFERRED")),
                source_url=item.get("source_url", "not_found"),
            )
            for item in (raw.get("strategic_priorities") or [])[:5]
        ]

        competitive_landscape = [
            CompetitiveLandscapeEntry(
                competitor_name=item.get("competitor_name", ""),
                evidence=item.get("evidence", ""),
                evidence_status=EvidenceStatus(item.get("evidence_status", "INFERRED")),
                source_url=item.get("source_url", "not_found"),
            )
            for item in (raw.get("competitive_landscape") or [])[:5]
        ]

        inferred_pain_points = [
            IntelInferredPainPoint(
                pain_point=item.get("pain_point", ""),
                evidence_status=EvidenceStatus.INFERRED,
                reasoning=item.get("reasoning", ""),
            )
            for item in (raw.get("inferred_pain_points") or [])[:5]
        ]

        recent_news = []
        for item in (raw.get("recent_news") or [])[:3]:
            try:
                from datetime import date
                date_str = item.get("date", "")
                try:
                    news_date = date.fromisoformat(date_str)
                except (ValueError, TypeError):
                    news_date = date.today()
                recent_news.append(RecentNewsItem(
                    headline=item.get("headline", ""),
                    date=news_date,
                    source_url=item.get("source_url", "not_found"),
                    summary=item.get("summary", ""),
                ))
            except Exception:
                continue

        return IntelReport(
            company_snapshot=raw.get("company_snapshot", f"[INFERRED] {company_name} is an account in our ICP."),
            strategic_priorities=strategic_priorities,
            tech_stack=raw.get("tech_stack") or [],
            competitive_landscape=competitive_landscape,
            inferred_pain_points=inferred_pain_points,
            recent_news=recent_news,
            buying_committee_summary=raw.get("buying_committee_summary", ""),
            recommended_angle=raw.get("recommended_angle", ""),
            generated_by=GeneratedBy(researcher="openai", synthesizer="openai"),
            generated_at=datetime.now(timezone.utc),
        )

    except Exception as exc:
        logger.error("IntelReport: failed to build model from raw dict: %s", exc)
        return None


async def generate_intel_report(
    company_name: str,
    domain: str,
    buyer_intel: BuyerIntelPackage | None,
    master_context: MasterContext,
    signals: list[AccountSignal] | None = None,
) -> IntelReport | None:
    """
    Generate an Account Intelligence Report using OpenAI.
    Returns IntelReport on success, None on failure.
    Called only for TIER_1 accounts.
    """
    logger.info("IntelReport: generating for domain=%s", domain)

    raw = await _openai_generate(company_name, domain, buyer_intel, master_context, signals)
    if not raw:
        logger.warning("IntelReport: generation failed for domain=%s", domain)
        return None

    report = _build_intel_report(raw, company_name)
    if report:
        logger.info("IntelReport: generated for domain=%s", domain)
    return report
