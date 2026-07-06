"""
Google News RSS signal source (free, no API key required).

Fetches recent news about the target company and uses LLM enrichment to
classify signal type and intent based on actual article content and sentiment,
rather than keyword substring matching.
"""

from __future__ import annotations

import logging
import urllib.parse
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

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

_GOOGLE_RSS = "https://news.google.com/rss/search"

# Broader query — we fetch more and let the LLM filter relevance
_QUERY_TERMS = (
    '("funding" OR "raises" OR "series" OR "expansion" OR "acquires" OR "merger" OR '
    '"appoints" OR "hires" OR "leadership" OR "launches" OR "partnership" OR "growth")'
)

# Fallback intent when the enricher assigns no type/intent (LLM unavailable or ambiguous)
_FALLBACK_INTENT = IntentLevel.MEDIUM

# Keyword → (type, intent) inference used ONLY when the enricher returns no
# signal_type. Without this, every un-typed article collapsed to EXPANSION,
# which is why the news feed looked like nothing but expansion signals.
_TYPE_KEYWORDS: list[tuple[tuple[str, ...], SignalType, IntentLevel]] = [
    (("raises", "raised", "funding", "series a", "series b", "series c", "seed round",
      "seed funding", "venture", "investment round", "secures $", "closes $"),
     SignalType.FUNDING, IntentLevel.HIGH),
    (("appoints", "names new", "joins as", "hires new", "new ceo", "new cfo", "new cto",
      "new coo", "new ciso", "chief ", "as ceo", "as cfo", "as cto", "vp of", "head of",
      "president", "board member"),
     SignalType.LEADERSHIP_HIRE, IntentLevel.MEDIUM),
    (("hiring", "is hiring", "job opening", "expands team", "recruiting", "adds talent"),
     SignalType.RELEVANT_HIRE, IntentLevel.MEDIUM),
    (("acquires", "acquisition", "merger", "merges", "expansion", "expands into",
      "launches", "partnership", "partners with", "opens new", "growth", "new market",
      "enters "),
     SignalType.EXPANSION, IntentLevel.MEDIUM),
]


def _infer_type_from_text(text: str) -> tuple[SignalType, IntentLevel]:
    """Best-effort type/intent from headline keywords when the enricher gives none."""
    low = text.lower()
    for keywords, sig_type, intent in _TYPE_KEYWORDS:
        if any(kw in low for kw in keywords):
            return sig_type, intent
    return SignalType.OTHER_NEWS, _FALLBACK_INTENT


class GoogleNewsSource(BaseSignalSource):
    async def fetch_signals(
        self,
        domain: str,
        company_name: str,
        master_context: MasterContext,
    ) -> list[AccountSignal]:
        try:
            return await self._fetch(domain, company_name, master_context)
        except Exception as exc:
            logger.warning("GoogleNewsSource: failed for domain=%s: %s: %s", domain, type(exc).__name__, exc)
            return []

    async def _fetch(
        self, domain: str, company_name: str, master_context: MasterContext
    ) -> list[AccountSignal]:
        query = f'"{company_name}" {_QUERY_TERMS}'
        params = {"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"}
        url = f"{_GOOGLE_RSS}?{urllib.parse.urlencode(params)}"

        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code != 200:
                return []
            content = resp.text

        root = ET.fromstring(content)
        items = root.findall(".//item")

        # Collect raw articles — up to 15 for the LLM to filter
        raw_articles: list[dict] = []
        for item in items[:15]:
            title_el = item.find("title")
            link_el = item.find("link")
            pub_date_el = item.find("pubDate")
            desc_el = item.find("description")

            title = (title_el.text or "") if title_el is not None else ""
            link = (link_el.text or "") if link_el is not None else ""
            description = (desc_el.text or "") if desc_el is not None else ""
            pub_date_text = pub_date_el.text if pub_date_el is not None else None

            try:
                detected_at = parsedate_to_datetime(pub_date_text) if pub_date_text else datetime.now(timezone.utc)
            except Exception:
                detected_at = datetime.now(timezone.utc)

            raw_articles.append({
                "id": str(uuid.uuid4()),
                "title": title,
                "description": description,
                "link": link,
                "detected_at": detected_at,
            })

        if not raw_articles:
            return []

        # LLM enrichment — classify by intent and sentiment, not just keywords
        candidates = [
            RawCandidate(
                id=a["id"],
                content=f"{a['title']}. {a['description']}",
                source_hint="news article",
            )
            for a in raw_articles
        ]
        enriched = await enrich_candidates(candidates, company_name, master_context)
        enriched_by_id = {e.id: e for e in enriched}

        signals: list[AccountSignal] = []
        for article in raw_articles:
            result = enriched_by_id.get(article["id"])
            if result is None or not result.is_relevant:
                continue

            if result.signal_type is not None:
                sig_type = result.signal_type
                intent_level = result.intent_level or _FALLBACK_INTENT
            else:
                # Enricher couldn't type it — infer from the headline instead of
                # blanket-labelling EXPANSION.
                sig_type, intent_level = _infer_type_from_text(
                    f"{article['title']} {article['description']}"
                )
            description = article["title"][:200]
            snippet = (article["description"] or article["title"])[:500]

            signals.append(AccountSignal(
                signal_id=uuid.uuid4(),
                type=sig_type,
                intent_level=intent_level,
                description=description,
                source=SignalSource.GOOGLE_NEWS,
                source_url=article["link"] or f"https://news.google.com/search?q={urllib.parse.quote(company_name)}",
                detected_at=article["detected_at"],
                evidence_snippet=snippet,
            ))

        return signals
