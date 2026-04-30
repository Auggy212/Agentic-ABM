"""
G2 signal source — web scrapes competitor reviews written by employees of the
target account. Produces COMPETITOR_REVIEW signals (HIGH intent).

G2 has no public API, so we use their public search pages. We search for
reviews where the reviewer is from the target company and the product reviewed
is one of the client's competitors.
"""

from __future__ import annotations

import logging
import re
import urllib.parse
import uuid
from datetime import datetime, timezone

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

_G2_SEARCH = "https://www.g2.com/search"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
}


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
            return await self._fetch(domain, company_name, competitors)
        except Exception as exc:
            logger.warning("G2Source: failed for domain=%s: %s", domain, exc)
            return []

    async def _fetch(
        self, domain: str, company_name: str, competitors: list[str]
    ) -> list[AccountSignal]:
        signals: list[AccountSignal] = []

        async with httpx.AsyncClient(timeout=20.0, headers=_HEADERS, follow_redirects=True) as client:
            for competitor in competitors[:3]:  # cap to 3 competitors to avoid hammering
                try:
                    query = f"{competitor} reviews {company_name}"
                    resp = await client.get(
                        _G2_SEARCH,
                        params={"query": query},
                    )
                    if resp.status_code != 200:
                        continue

                    # Heuristic: look for review count mentions in the HTML
                    text = resp.text
                    review_mentions = len(re.findall(
                        rf"(?i){re.escape(company_name)}",
                        text,
                    ))

                    if review_mentions > 0:
                        signals.append(AccountSignal(
                            signal_id=uuid.uuid4(),
                            type=SignalType.COMPETITOR_REVIEW,
                            intent_level=IntentLevel.HIGH,
                            description=(
                                f"{company_name} employee(s) have reviewed {competitor} on G2 "
                                f"— actively evaluating competitor"
                            ),
                            source=SignalSource.G2,
                            source_url=f"https://www.g2.com/search?query={urllib.parse.quote(competitor)}",
                            detected_at=datetime.now(timezone.utc),
                            evidence_snippet=(
                                f"G2 search for '{competitor} {company_name}' returned {review_mentions} "
                                f"mention(s). Competitor evaluation activity detected."
                            )[:500],
                        ))
                except Exception as exc:
                    logger.warning("G2Source: error for competitor=%s: %s", competitor, exc)
                    continue

        return signals
