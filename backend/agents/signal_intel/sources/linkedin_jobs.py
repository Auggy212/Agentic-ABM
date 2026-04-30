"""
LinkedIn Jobs signal source — uses Apollo's people/org endpoints to surface
hiring signals. Produces RELEVANT_HIRE (high-intent when hiring into ICP buyer
titles) or LEADERSHIP_HIRE (high-intent for C-suite/VP new hires).

Apollo free tier includes job postings in org enrichment data.
"""

from __future__ import annotations

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

APOLLO_API_KEY = os.environ.get("APOLLO_API_KEY", "")
APOLLO_BASE_URL = "https://api.apollo.io/v1"

_C_SUITE_TOKENS = frozenset({"ceo", "cfo", "cro", "coo", "cto", "cmo", "chief", "president", "founder"})


def _is_leadership_hire(title: str) -> bool:
    t = title.lower()
    return any(tok in t for tok in _C_SUITE_TOKENS) or "vp" in t.split()


def _is_relevant_hire(title: str, icp_titles: list[str]) -> bool:
    t = title.lower()
    return any(icp.lower() in t or t in icp.lower() for icp in icp_titles)


class LinkedInJobsSource(BaseSignalSource):
    async def fetch_signals(
        self,
        domain: str,
        company_name: str,
        master_context: MasterContext,
    ) -> list[AccountSignal]:
        if not APOLLO_API_KEY:
            logger.warning("LinkedInJobsSource: APOLLO_API_KEY not set")
            return []
        try:
            return await self._fetch(domain, master_context)
        except Exception as exc:
            logger.warning("LinkedInJobsSource: failed for domain=%s: %s", domain, exc)
            return []

    async def _fetch(self, domain: str, master_context: MasterContext) -> list[AccountSignal]:
        icp_titles = master_context.buyers.titles
        signals: list[AccountSignal] = []

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{APOLLO_BASE_URL}/organizations/enrich",
                headers={"Content-Type": "application/json", "Cache-Control": "no-cache"},
                json={"api_key": APOLLO_API_KEY, "domain": domain},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()

        org = data.get("organization") or {}
        job_postings = org.get("job_postings") or []

        for job in job_postings[:10]:
            title = (job.get("title") or "").strip()
            if not title:
                continue

            posted_at_str = job.get("posted_at") or datetime.now(timezone.utc).isoformat()
            try:
                detected_at = datetime.fromisoformat(posted_at_str.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                detected_at = datetime.now(timezone.utc)

            if _is_leadership_hire(title):
                signals.append(AccountSignal(
                    signal_id=uuid.uuid4(),
                    type=SignalType.LEADERSHIP_HIRE,
                    intent_level=IntentLevel.HIGH,
                    description=f"Leadership hire: {title}",
                    source=SignalSource.LINKEDIN_JOBS,
                    source_url=job.get("url") or f"https://linkedin.com/jobs/search/?keywords={domain}",
                    detected_at=detected_at,
                    evidence_snippet=f"Open role at {domain}: {title}",
                ))
            elif _is_relevant_hire(title, icp_titles):
                signals.append(AccountSignal(
                    signal_id=uuid.uuid4(),
                    type=SignalType.RELEVANT_HIRE,
                    intent_level=IntentLevel.HIGH,
                    description=f"Hiring for ICP-aligned role: {title}",
                    source=SignalSource.LINKEDIN_JOBS,
                    source_url=job.get("url") or f"https://linkedin.com/jobs/search/?keywords={domain}",
                    detected_at=detected_at,
                    evidence_snippet=f"Open role at {domain}: {title}",
                ))

        return signals
