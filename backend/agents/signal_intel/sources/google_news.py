"""
Google News RSS signal source (free, no API key required).

Searches for funding, expansion, leadership, and acquisition news about the
target company and maps results to FUNDING / EXPANSION / LEADERSHIP_HIRE signals.
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
from backend.schemas.models import (
    AccountSignal,
    IntentLevel,
    MasterContext,
    SignalSource,
    SignalType,
)

logger = logging.getLogger(__name__)

_QUERY_TERMS = '("funding" OR "raises" OR "expansion" OR "acquires" OR "hires" OR "launches" OR "leadership")'
_GOOGLE_RSS = "https://news.google.com/rss/search"

_KEYWORD_MAP: list[tuple[list[str], SignalType, IntentLevel]] = [
    (["funding", "raises", "series", "round", "investment"], SignalType.FUNDING, IntentLevel.HIGH),
    (["expansion", "expands", "launches", "opens", "enters"], SignalType.EXPANSION, IntentLevel.MEDIUM),
    (["appoints", "names", "hires", "joins as ceo", "joins as cto", "new ceo", "new cfo", "new cro"], SignalType.LEADERSHIP_HIRE, IntentLevel.HIGH),
]


def _map_signal(title: str, description: str) -> tuple[SignalType, IntentLevel] | None:
    combined = (title + " " + description).lower()
    for keywords, sig_type, intent in _KEYWORD_MAP:
        if any(kw in combined for kw in keywords):
            return sig_type, intent
    return None


class GoogleNewsSource(BaseSignalSource):
    async def fetch_signals(
        self,
        domain: str,
        company_name: str,
        master_context: MasterContext,
    ) -> list[AccountSignal]:
        try:
            return await self._fetch(company_name)
        except Exception as exc:
            logger.warning("GoogleNewsSource: failed for domain=%s: %s", domain, exc)
            return []

    async def _fetch(self, company_name: str) -> list[AccountSignal]:
        query = f'"{company_name}" {_QUERY_TERMS}'
        params = {"q": query, "hl": "en-US", "gl": "US", "ceid": "US:en"}
        url = f"{_GOOGLE_RSS}?{urllib.parse.urlencode(params)}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code != 200:
                return []
            content = resp.text

        root = ET.fromstring(content)
        items = root.findall(".//item")

        signals: list[AccountSignal] = []
        for item in items[:10]:
            title_el = item.find("title")
            link_el = item.find("link")
            pub_date_el = item.find("pubDate")
            desc_el = item.find("description")

            title = title_el.text or "" if title_el is not None else ""
            link = link_el.text or "" if link_el is not None else ""
            description = desc_el.text or "" if desc_el is not None else ""

            mapped = _map_signal(title, description)
            if not mapped:
                continue

            sig_type, intent_level = mapped

            try:
                detected_at = parsedate_to_datetime(pub_date_el.text) if pub_date_el is not None else datetime.now(timezone.utc)
            except Exception:
                detected_at = datetime.now(timezone.utc)

            snippet = (description or title)[:500]

            signals.append(AccountSignal(
                signal_id=uuid.uuid4(),
                type=sig_type,
                intent_level=intent_level,
                description=title[:200],
                source=SignalSource.GOOGLE_NEWS,
                source_url=link or f"https://news.google.com/search?q={urllib.parse.quote(company_name)}",
                detected_at=detected_at,
                evidence_snippet=snippet,
            ))

        return signals
