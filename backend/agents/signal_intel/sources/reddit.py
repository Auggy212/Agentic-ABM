"""
Reddit signal source — searches subreddits relevant to master_context.icp.industries
for mentions of the target company and pain point discussions.

Uses Reddit's public app-only OAuth (free tier, 60 req/min).
Environment variables: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET.
"""

from __future__ import annotations

import asyncio
import logging
import os
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

REDDIT_CLIENT_ID = os.environ.get("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET = os.environ.get("REDDIT_CLIENT_SECRET", "")
REDDIT_TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
REDDIT_SEARCH_URL = "https://oauth.reddit.com/search"
REDDIT_USER_AGENT = "ABMEngineBot/0.1 (by u/abm_engine_bot)"

# Industry → subreddits heuristic
_INDUSTRY_SUBREDDITS: dict[str, list[str]] = {
    "saas": ["r/saas", "r/startups", "r/sales"],
    "fintech": ["r/fintech", "r/personalfinance", "r/investing"],
    "healthcare": ["r/healthit", "r/medicine"],
    "ecommerce": ["r/ecommerce", "r/shopify"],
    "default": ["r/sales", "r/b2b", "r/marketing", "r/startups"],
}


def _get_subreddits(industries: list[str]) -> list[str]:
    subs: list[str] = []
    for industry in industries:
        key = industry.lower()
        for k, v in _INDUSTRY_SUBREDDITS.items():
            if k in key:
                subs.extend(v)
                break
    return list(set(subs)) or _INDUSTRY_SUBREDDITS["default"]


class RedditSource(BaseSignalSource):
    def __init__(self) -> None:
        self._token: str | None = None

    async def fetch_signals(
        self,
        domain: str,
        company_name: str,
        master_context: MasterContext,
    ) -> list[AccountSignal]:
        if not REDDIT_CLIENT_ID or not REDDIT_CLIENT_SECRET:
            logger.warning("RedditSource: REDDIT_CLIENT_ID/SECRET not set")
            return []
        try:
            return await self._fetch(domain, company_name, master_context)
        except Exception as exc:
            logger.warning("RedditSource: failed for domain=%s: %s", domain, exc)
            return []

    async def _get_token(self, client: httpx.AsyncClient) -> str:
        resp = await client.post(
            REDDIT_TOKEN_URL,
            auth=(REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET),
            data={"grant_type": "client_credentials"},
            headers={"User-Agent": REDDIT_USER_AGENT},
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

    async def _fetch(
        self, domain: str, company_name: str, master_context: MasterContext
    ) -> list[AccountSignal]:
        subreddits = _get_subreddits(master_context.icp.industries)
        pain_points = master_context.buyers.pain_points[:3]
        signals: list[AccountSignal] = []

        headers = {"User-Agent": REDDIT_USER_AGENT}

        async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
            token = await self._get_token(client)
            auth_headers = {**headers, "Authorization": f"Bearer {token}"}

            # Search 1: company name mentions
            queries = [company_name] + [f"{company_name} {pp[:30]}" for pp in pain_points[:2]]

            for query in queries:
                await asyncio.sleep(1.0)  # stay well under 60 req/min
                try:
                    resp = await client.get(
                        REDDIT_SEARCH_URL,
                        params={"q": query, "sort": "new", "limit": 5, "type": "link"},
                        headers=auth_headers,
                    )
                    if resp.status_code == 429:
                        logger.warning("RedditSource: rate limited — sleeping 60s")
                        await asyncio.sleep(60)
                        continue
                    if resp.status_code != 200:
                        continue

                    data = resp.json()
                    posts = (data.get("data") or {}).get("children") or []

                    for post in posts[:3]:
                        post_data = post.get("data") or {}
                        title = post_data.get("title") or ""
                        url = f"https://reddit.com{post_data.get('permalink', '')}"
                        score = post_data.get("score", 0)
                        created_utc = post_data.get("created_utc", 0)

                        detected_at = datetime.fromtimestamp(created_utc, tz=timezone.utc) if created_utc else datetime.now(timezone.utc)
                        intent = IntentLevel.MEDIUM if score > 10 else IntentLevel.LOW

                        signals.append(AccountSignal(
                            signal_id=uuid.uuid4(),
                            type=SignalType.EXEC_CONTENT,
                            intent_level=intent,
                            description=f"Reddit discussion mentioning {company_name}: {title[:100]}",
                            source=SignalSource.REDDIT,
                            source_url=url,
                            detected_at=detected_at,
                            evidence_snippet=f"Post: '{title[:300]}' (score: {score})"[:500],
                        ))
                except Exception as exc:
                    logger.warning("RedditSource: query error for '%s': %s", query, exc)

        return signals[:5]  # cap at 5 Reddit signals per company
