"""
G2 signal source — searches for competitor review activity by employees of the
target account. Uses LLM enrichment to assess whether the scraped content
actually indicates competitor evaluation, not just that the company name appears
in navigation links or generic page text.

G2 has no public API so we scrape their public search pages.
"""

from __future__ import annotations

import asyncio
import logging
import random
import re
import urllib.parse
import uuid
from datetime import datetime, timezone

import httpx

from backend.agents.signal_intel.sources.base import BaseSignalSource
from backend.agents.signal_intel.sources.enricher import RawCandidate, enrich_candidates
from backend.schemas.models import (
    AccountSignal,
    IntentLevel,
    MasterContext,
    SignalSource,
    SignalType,
)

logger = logging.getLogger(__name__)

_G2_SEARCH = "https://www.g2.com/search"

_USER_AGENTS = [
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
]

_MAX_RETRIES = 3
_RETRY_BACKOFF = 2.0  # seconds, doubled each retry

# Pull out short text fragments near company-name mentions for the LLM
_CONTEXT_WINDOW = 200  # chars around each mention


def _extract_mention_snippets(html: str, company_name: str, competitor: str) -> list[str]:
    """Extract text fragments near company name mentions — avoids feeding raw HTML to LLM."""
    # Strip tags to get readable text
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)

    pattern = re.compile(re.escape(company_name), re.IGNORECASE)
    snippets: list[str] = []
    for m in pattern.finditer(text):
        start = max(0, m.start() - _CONTEXT_WINDOW)
        end = min(len(text), m.end() + _CONTEXT_WINDOW)
        snippet = text[start:end].strip()
        # Only keep snippets that also mention the competitor (stronger signal)
        if competitor.lower() in snippet.lower():
            snippets.append(snippet)

    return snippets[:5]  # cap per competitor


class G2Source(BaseSignalSource):
    async def fetch_signals(
        self,
        domain: str,
        company_name: str,
        master_context: MasterContext,
    ) -> list[AccountSignal]:
        competitors = [c.name for c in master_context.competitors]
        if not competitors:
            return []
        try:
            return await self._fetch(domain, company_name, competitors, master_context)
        except Exception as exc:
            logger.warning("G2Source: failed for domain=%s: %s: %s", domain, type(exc).__name__, exc)
            return []

    async def _fetch(
        self,
        domain: str,
        company_name: str,
        competitors: list[str],
        master_context: MasterContext,
    ) -> list[AccountSignal]:
        raw_candidates: list[dict] = []

        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            for competitor in competitors[:3]:
                snippets: list[str] = []
                for attempt in range(_MAX_RETRIES):
                    try:
                        headers = {
                            "User-Agent": random.choice(_USER_AGENTS),
                            "Accept": "text/html,application/xhtml+xml",
                            "Accept-Language": "en-US,en;q=0.9",
                        }
                        resp = await client.get(
                            _G2_SEARCH,
                            params={"query": f"{competitor} {company_name}"},
                            headers=headers,
                        )
                        if resp.status_code == 429 or resp.status_code == 503:
                            wait = _RETRY_BACKOFF * (2 ** attempt) + random.uniform(0, 1)
                            logger.debug("G2Source: rate-limited for competitor=%s, retrying in %.1fs", competitor, wait)
                            await asyncio.sleep(wait)
                            continue
                        if resp.status_code != 200:
                            logger.debug("G2Source: HTTP %s for competitor=%s", resp.status_code, competitor)
                            break
                        snippets = _extract_mention_snippets(resp.text, company_name, competitor)
                        break
                    except httpx.TimeoutException:
                        wait = _RETRY_BACKOFF * (2 ** attempt)
                        logger.debug("G2Source: timeout for competitor=%s, retrying in %.1fs", competitor, wait)
                        await asyncio.sleep(wait)
                    except Exception as exc:
                        logger.debug("G2Source: error for competitor=%s: %s", competitor, exc)
                        break

                if not snippets:
                    continue

                raw_candidates.append({
                    "id": str(uuid.uuid4()),
                    "competitor": competitor,
                    "snippets": snippets,
                    "search_url": f"https://www.g2.com/search?query={urllib.parse.quote(competitor)}",
                })

        if not raw_candidates:
            return []

        # LLM enrichment — let the model read the actual text fragments and determine
        # whether they represent genuine review/evaluation activity, not just page mentions
        candidates = [
            RawCandidate(
                id=c["id"],
                content=(
                    f"G2 search for '{c['competitor']}' mentions of {company_name}. "
                    f"Extracted text snippets: {' | '.join(c['snippets'])}"
                ),
                source_hint="g2 competitor review page",
            )
            for c in raw_candidates
        ]
        enriched = await enrich_candidates(candidates, company_name, master_context)
        enriched_by_id = {e.id: e for e in enriched}

        signals: list[AccountSignal] = []
        for candidate in raw_candidates:
            result = enriched_by_id.get(candidate["id"])
            if result is None or not result.is_relevant:
                continue

            sig_type = result.signal_type or SignalType.COMPETITOR_REVIEW
            intent_level = result.intent_level or IntentLevel.HIGH
            competitor = candidate["competitor"]

            signals.append(AccountSignal(
                signal_id=uuid.uuid4(),
                type=sig_type,
                intent_level=intent_level,
                description=(
                    f"{company_name} employee(s) have reviewed {competitor} on G2 "
                    f"— actively evaluating competitor"
                ),
                source=SignalSource.G2,
                source_url=candidate["search_url"],
                detected_at=datetime.now(timezone.utc),
                evidence_snippet=(" | ".join(candidate["snippets"]))[:500],
            ))

        return signals
