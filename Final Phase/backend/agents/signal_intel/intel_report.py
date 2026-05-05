"""
Tier 1 Account Intelligence Report builder.

Two-stage pipeline:
  Stage A: Perplexity API — parallel research on strategic priorities, tech stack,
           competitive landscape, and recent news.
  Stage B: Claude API — synthesize all Perplexity outputs + buyer intel + master
           context into a structured IntelReport with [VERIFIED]/[INFERRED] tags.

Every claim in the output MUST be tagged [VERIFIED] or [INFERRED].
The Verifier (Phase 3) blocks anything without a tag.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

import httpx

from backend.schemas.models import (
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

PERPLEXITY_API_KEY = os.environ.get("PERPLEXITY_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL = "claude-sonnet-4-6"

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

_SYNTHESIS_SYSTEM = f"""You are an ABM intelligence analyst. Synthesize research into a structured Account Intelligence Report.

CRITICAL TAGGING RULE: Every factual claim MUST be tagged [VERIFIED] (citation present in research) or [INFERRED] (your analysis, no direct citation). Mixing tags or omitting them is a failure mode. The Verifier agent will block any claim without a tag.

Return ONLY valid JSON matching this schema:
{_INTEL_SCHEMA_SUMMARY}

Constraints:
- recent_news: max 3 items
- inferred_pain_points: evidence_status MUST be "INFERRED" for every entry
- source_url: use the actual URL from research if available, otherwise "not_found"
- company_snapshot: a 2-3 sentence narrative with [VERIFIED] or [INFERRED] inline tags on every factual claim"""


async def _perplexity_research(
    company_name: str,
    domain: str,
    client_company_name: str,
) -> dict[str, str]:
    """Run 4 Perplexity queries in parallel and return a dict of results."""
    if not PERPLEXITY_API_KEY:
        logger.warning("IntelReport: PERPLEXITY_API_KEY not set — skipping research")
        return {}

    questions = {
        "strategic_priorities": f"What are {company_name}'s top 3 strategic priorities in 2025? Cite sources with URLs.",
        "tech_stack": f"What technologies and tools does {company_name} currently use? List with sources.",
        "competitive_landscape": f"Which competitors of {client_company_name} is {company_name} currently using or evaluating? Cite sources.",
        "recent_news": f"What are the most significant news events for {company_name} in the last 60 days? Top 3 with dates and sources.",
    }

    results: dict[str, str] = {}

    async def _query(key: str, question: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    PERPLEXITY_URL,
                    headers={
                        "Authorization": f"Bearer {PERPLEXITY_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "llama-3.1-sonar-large-128k-online",
                        "messages": [
                            {"role": "system", "content": "Be precise and always include source URLs."},
                            {"role": "user", "content": question},
                        ],
                        "return_citations": True,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
                results[key] = content
        except Exception as exc:
            logger.warning("IntelReport: Perplexity query '%s' failed: %s", key, exc)
            results[key] = ""

    import asyncio
    await asyncio.gather(*[_query(k, q) for k, q in questions.items()])
    return results


async def _claude_synthesize(
    company_name: str,
    domain: str,
    research: dict[str, str],
    buyer_intel: BuyerIntelPackage | None,
    master_context: MasterContext,
) -> dict | None:
    """Synthesize research into IntelReport JSON via Claude. Retries once on failure."""
    if not ANTHROPIC_API_KEY:
        logger.warning("IntelReport: ANTHROPIC_API_KEY not set — cannot synthesize")
        return None

    buyer_summary = ""
    if buyer_intel and domain in buyer_intel.accounts:
        contacts = buyer_intel.accounts[domain]
        roles_summary = ", ".join(
            f"{c.full_name} ({c.committee_role.value})"
            for c in contacts[:5]
        )
        buyer_summary = f"Buying committee: {roles_summary}"

    user_message = f"""Company: {company_name} ({domain})
Client company (your client): {master_context.company.name}

Research inputs:
Strategic priorities: {research.get('strategic_priorities', 'No data')}

Tech stack: {research.get('tech_stack', 'No data')}

Competitive landscape: {research.get('competitive_landscape', 'No data')}

Recent news: {research.get('recent_news', 'No data')}

{buyer_summary}

Client ICP context: Targeting {', '.join(master_context.icp.industries[:3])} companies.
Competitors tracked: {', '.join(c.name for c in master_context.competitors[:3])}.

Produce the IntelReport JSON now."""

    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    ANTHROPIC_URL,
                    headers={
                        "x-api-key": ANTHROPIC_API_KEY,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": CLAUDE_MODEL,
                        "max_tokens": 2000,
                        "system": _SYNTHESIS_SYSTEM,
                        "messages": [{"role": "user", "content": user_message}],
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                text = data["content"][0]["text"].strip()

                # Strip markdown code blocks if present
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                    text = text.strip()

                parsed = json.loads(text)
                return parsed

        except json.JSONDecodeError as exc:
            logger.warning("IntelReport: Claude returned invalid JSON (attempt %d): %s", attempt + 1, exc)
            if attempt == 1:
                return None
        except Exception as exc:
            logger.error("IntelReport: Claude synthesis failed (attempt %d): %s", attempt + 1, exc)
            if attempt == 1:
                return None

    return None


def _build_intel_report(raw: dict, company_name: str) -> IntelReport | None:
    """Parse Claude's JSON output into an IntelReport Pydantic model."""
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

        recent_news_raw = (raw.get("recent_news") or [])[:3]
        recent_news = []
        for item in recent_news_raw:
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
                    source_url=item.get("source_url", f"https://example.com/{company_name.lower().replace(' ', '-')}-news"),
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
            generated_by=GeneratedBy(researcher="perplexity", synthesizer="claude-sonnet-4"),
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
) -> IntelReport | None:
    """
    Full two-stage pipeline: Perplexity research → Claude synthesis.

    Returns IntelReport on success, None on failure.
    Called only for TIER_1 accounts.
    """
    logger.info("IntelReport: starting for domain=%s", domain)

    research = await _perplexity_research(company_name, domain, master_context.company.name)

    raw = await _claude_synthesize(company_name, domain, research, buyer_intel, master_context)
    if not raw:
        logger.warning("IntelReport: synthesis failed for domain=%s", domain)
        return None

    report = _build_intel_report(raw, company_name)
    if report:
        logger.info("IntelReport: generated for domain=%s", domain)
    return report
