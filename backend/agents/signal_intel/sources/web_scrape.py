"""
Web-scrape signal source — no API key required.

Scrapes the company's own website (homepage + /blog or /news) and their
public Crunchbase page to surface funding, expansion, and hiring signals.
Raw text is passed through the LLM enricher for semantic classification,
same as all other sources.

Probe order per domain:
  1. https://{domain}            — homepage tagline, press, announcements
  2. https://{domain}/blog       — recent posts (falls back to /news)
  3. https://www.crunchbase.com/organization/{slug}  — public funding page
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

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

_TIMEOUT = httpx.Timeout(connect=5.0, read=8.0, write=5.0, pool=5.0)
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}
_MAX_TEXT_CHARS = int(os.environ.get("WEB_SCRAPE_MAX_TEXT_CHARS", "800"))


def _slug(domain: str) -> str:
    """best-guess Crunchbase org slug from domain, e.g. 'hyperface.co' → 'hyperface'"""
    return domain.split(".")[0]


def _visible_text(html: str, max_chars: int = _MAX_TEXT_CHARS) -> str:
    """Extract clean visible text from HTML, stripping scripts/styles."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "header", "footer", "nav"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    # Collapse whitespace
    text = re.sub(r"\s{2,}", " ", text)
    return text[:max_chars]


def _extract_headings_and_links(html: str, base_url: str) -> list[str]:
    """Extract h1–h3 headings and anchor text as short signal snippets."""
    soup = BeautifulSoup(html, "html.parser")
    snippets: list[str] = []
    for tag in soup.find_all(["h1", "h2", "h3"]):
        text = tag.get_text(strip=True)
        if text and len(text) > 10:
            snippets.append(text[:200])
    return snippets[:20]


class WebScrapeSource(BaseSignalSource):
    async def fetch_signals(
        self,
        domain: str,
        company_name: str,
        master_context: MasterContext,
    ) -> list[AccountSignal]:
        try:
            return await self._fetch(domain, company_name, master_context)
        except Exception as exc:
            logger.warning("WebScrapeSource: failed for domain=%s: %s: %s", domain, type(exc).__name__, exc)
            return []

    async def _fetch(
        self,
        domain: str,
        company_name: str,
        master_context: MasterContext,
    ) -> list[AccountSignal]:
        raw_chunks: list[dict] = []

        # All pages fetched in parallel — total wall time = slowest single page
        urls = [
            (f"https://{domain}", "company homepage"),
            (f"https://www.{domain}", "company homepage"),
            (f"https://{domain}/blog", "company blog/news"),
            (f"https://{domain}/news", "company blog/news"),
            (f"https://{domain}/about", "company about page"),
        ]

        async with httpx.AsyncClient(
            timeout=_TIMEOUT,
            headers=_HEADERS,
            follow_redirects=True,
        ) as client:
            results = await asyncio.gather(
                *[self._scrape(client, url) for url, _ in urls],
                return_exceptions=True,
            )

        for (url, hint), text in zip(urls, results):
            if isinstance(text, Exception) or not text:
                continue
            raw_chunks.append({
                "id": str(uuid.uuid4()),
                "content": text,
                "url": url,
                "source_hint": hint,
            })

        if not raw_chunks:
            logger.debug("WebScrapeSource: no content scraped for domain=%s", domain)
            return []

        candidates = [
            RawCandidate(
                id=chunk["id"],
                content=chunk["content"],
                source_hint=chunk["source_hint"],
            )
            for chunk in raw_chunks
        ]
        enriched = await enrich_candidates(candidates, company_name, master_context)
        enriched_by_id = {e.id: e for e in enriched}

        signals: list[AccountSignal] = []
        homepage_chunk = next(
            (c for c in raw_chunks if "homepage" in c["source_hint"]), None
        )

        for chunk in raw_chunks:
            result = enriched_by_id.get(chunk["id"])
            if result is None or not result.is_relevant:
                continue

            sig_type = result.signal_type or SignalType.EXPANSION
            intent_level = result.intent_level or IntentLevel.LOW

            signals.append(AccountSignal(
                signal_id=uuid.uuid4(),
                type=sig_type,
                intent_level=intent_level,
                description=f"{company_name} — signal from {chunk['source_hint']}",
                source=SignalSource.WEB_SCRAPE,
                source_url=chunk["url"],
                detected_at=datetime.now(timezone.utc),
                evidence_snippet=(result.reasoning or chunk["content"])[:500],
            ))

        # Guarantee at least one LOW signal when we scraped content but enricher
        # filtered everything out — the company exists and has a web presence.
        if not signals and homepage_chunk:
            signals.append(AccountSignal(
                signal_id=uuid.uuid4(),
                type=SignalType.ICP_MATCH_NO_SIGNAL,
                intent_level=IntentLevel.LOW,
                description=f"{company_name} — web presence confirmed, no strong intent signals detected",
                source=SignalSource.WEB_SCRAPE,
                source_url=homepage_chunk["url"],
                detected_at=datetime.now(timezone.utc),
                evidence_snippet=homepage_chunk["content"][:500],
            ))

        return signals

    async def _scrape(self, client: httpx.AsyncClient, url: str) -> str | None:
        """Fetch a URL and return clean visible text, or None on failure."""
        try:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None
            ct = resp.headers.get("content-type", "")
            if "text/html" not in ct:
                return None
            return _visible_text(resp.text) or None
        except Exception as exc:
            logger.debug("WebScrapeSource: could not fetch %s: %s", url, exc)
            return None
