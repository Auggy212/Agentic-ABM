"""
Reddit signal source — searches subreddits relevant to master_context.icp.industries
for mentions of the target company and pain point discussions.

Uses LLM enrichment to assess whether each post reflects genuine pain, intent, or
relevant discussion — replacing the upvote-score-only intent heuristic.

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
from backend.agents.signal_intel.sources.enricher import RawCandidate, enrich_candidates
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
_REQUEST_SLEEP_SECS = float(os.environ.get("REDDIT_REQUEST_SLEEP_SECS", "1.0"))
_RATE_LIMIT_SLEEP_SECS = float(os.environ.get("REDDIT_RATE_LIMIT_SLEEP_SECS", "60.0"))
_MAX_SIGNALS_PER_COMPANY = int(os.environ.get("REDDIT_MAX_SIGNALS", "5"))

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
            logger.debug("RedditSource: REDDIT_CLIENT_ID/SECRET not set — skipping")
            return []
        try:
            return await self._fetch(domain, company_name, master_context)
        except Exception as exc:
            logger.warning("RedditSource: failed for domain=%s: %s: %s", domain, type(exc).__name__, exc)
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
        headers = {"User-Agent": REDDIT_USER_AGENT}

        raw_posts: list[dict] = []

        async with httpx.AsyncClient(timeout=8.0, headers=headers) as client:
            if not self._token:
                self._token = await self._get_token(client)
            token = self._token
            auth_headers = {**headers, "Authorization": f"Bearer {token}"}

            queries = [company_name] + [f"{company_name} {pp[:30]}" for pp in pain_points[:2]]

            rate_limited = False
            for query in queries:
                if rate_limited:
                    break
                await asyncio.sleep(_REQUEST_SLEEP_SECS)
                try:
                    resp = await client.get(
                        REDDIT_SEARCH_URL,
                        params={"q": query, "sort": "new", "limit": 5, "type": "link"},
                        headers=auth_headers,
                    )
                    if resp.status_code == 429:
                        logger.warning("RedditSource: rate limited — will retry after %.0fs", _RATE_LIMIT_SLEEP_SECS)
                        rate_limited = True
                        continue
                    if resp.status_code != 200:
                        continue

                    data = resp.json()
                    posts = (data.get("data") or {}).get("children") or []

                    for post in posts[:3]:
                        post_data = post.get("data") or {}
                        title = post_data.get("title") or ""
                        selftext = (post_data.get("selftext") or "")[:400]
                        url = f"https://reddit.com{post_data.get('permalink', '')}"
                        score = post_data.get("score", 0)
                        created_utc = post_data.get("created_utc", 0)
                        detected_at = (
                            datetime.fromtimestamp(created_utc, tz=timezone.utc)
                            if created_utc
                            else datetime.now(timezone.utc)
                        )

                        raw_posts.append({
                            "id": str(uuid.uuid4()),
                            "title": title,
                            "body": selftext,
                            "url": url,
                            "score": score,
                            "detected_at": detected_at,
                        })
                except Exception as exc:
                    logger.warning("RedditSource: query error for '%s': %s", query, exc)

        if not raw_posts:
            return []

        # LLM enrichment — assess sentiment and relevance of each post's content,
        # not just whether the company name appears or what the upvote count is
        candidates = [
            RawCandidate(
                id=p["id"],
                content=f"Title: {p['title']}. Body: {p['body']} (upvotes: {p['score']})",
                source_hint="reddit post",
            )
            for p in raw_posts
        ]
        enriched = await enrich_candidates(candidates, company_name, master_context)
        enriched_by_id = {e.id: e for e in enriched}

        signals: list[AccountSignal] = []
        for post in raw_posts:
            result = enriched_by_id.get(post["id"])
            if result is None or not result.is_relevant:
                continue

            sig_type = result.signal_type or SignalType.EXEC_CONTENT
            intent_level = result.intent_level or IntentLevel.LOW

            signals.append(AccountSignal(
                signal_id=uuid.uuid4(),
                type=sig_type,
                intent_level=intent_level,
                description=f"Reddit discussion about {company_name}: {post['title'][:100]}",
                source=SignalSource.REDDIT,
                source_url=post["url"],
                detected_at=post["detected_at"],
                evidence_snippet=f"Post: '{post['title'][:300]}' (score: {post['score']})"[:500],
            ))

        if rate_limited:
            await asyncio.sleep(_RATE_LIMIT_SLEEP_SECS)

        return signals[:_MAX_SIGNALS_PER_COMPANY]
