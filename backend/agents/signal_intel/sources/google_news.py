"""
Google News RSS signal source (free, no API key required).

Fetches recent news about the target company and uses LLM enrichment to
classify signal type and intent based on actual article content and sentiment,
rather than keyword substring matching.
"""

from __future__ import annotations

import logging
import os
import urllib.parse
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
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

# News is only a live buying signal while it's fresh — discard articles older than
# this window before we even spend enrichment tokens on them. Shares the funding
# max-age env var so "funding + news" stay on one 90-day policy (see Q2).
_MAX_NEWS_AGE_DAYS = int(os.environ.get("SIGNAL_INTEL_NEWS_MAX_AGE_DAYS",
                        os.environ.get("SIGNAL_INTEL_FUNDING_MAX_AGE_DAYS", "90")))

# Fallback intent when the enricher assigns no type/intent (LLM unavailable or ambiguous)
_FALLBACK_INTENT = IntentLevel.MEDIUM

# Keyword → (type, intent) inference used ONLY when the enricher returns no
# signal_type. Order matters — the first bucket that matches wins, so the
# specific buckets (funding, leadership, hiring, M&A) are checked BEFORE the
# broad expansion bucket. Previously "launches"/"partnership"/"growth" lived in
# the expansion bucket and swallowed most generic news, which is why the feed
# looked like nothing but FUNDING + EXPANSION (see Q5).
_TYPE_KEYWORDS: list[tuple[tuple[str, ...], SignalType, IntentLevel]] = [
    (("raises", "raised", "funding", "series a", "series b", "series c", "seed round",
      "seed funding", "venture", "investment round", "secures $", "closes $"),
     SignalType.FUNDING, IntentLevel.HIGH),
    (("appoints", "names new", "joins as", "hires new", "new ceo", "new cfo", "new cto",
      "new coo", "new ciso", "chief ", "as ceo", "as cfo", "as cto", "vp of", "head of",
      "president", "board member", "steps down", "resigns", "successor"),
     SignalType.LEADERSHIP_HIRE, IntentLevel.MEDIUM),
    (("hiring", "is hiring", "job opening", "expands team", "recruiting", "adds talent",
      "headcount", "grows team"),
     SignalType.RELEVANT_HIRE, IntentLevel.MEDIUM),
    # Genuine market/footprint expansion and M&A only — NOT generic PR verbs.
    (("acquires", "acquisition", "merger", "merges", "expands into", "opens new",
      "new market", "enters ", "new office", "new region", "new country"),
     SignalType.EXPANSION, IntentLevel.MEDIUM),
    # Industry/conference/award coverage that isn't a direct buying trigger.
    (("conference", "summit", "keynote", "award", "recognized", "named to",
      "report finds", "study", "survey"),
     SignalType.INDUSTRY_EVENT, IntentLevel.LOW),
]


def _infer_type_from_text(text: str) -> tuple[SignalType, IntentLevel]:
    """Best-effort type/intent from headline keywords when the enricher gives none.

    Generic product/partnership/growth PR ("launches", "partners with", "growth")
    no longer maps to EXPANSION — it falls through to OTHER_NEWS so the type
    distribution reflects reality instead of collapsing into EXPANSION."""
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

        # Only capture news from the last _MAX_NEWS_AGE_DAYS days (Q2). Articles
        # with an unparseable/missing pubDate are treated as "now" and kept — we
        # don't drop a signal just because Google omitted the date.
        cutoff = datetime.now(timezone.utc) - timedelta(days=_MAX_NEWS_AGE_DAYS)

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
            if detected_at.tzinfo is None:
                detected_at = detected_at.replace(tzinfo=timezone.utc)

            # Skip stale news before spending any enrichment tokens on it.
            if detected_at < cutoff:
                continue

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
