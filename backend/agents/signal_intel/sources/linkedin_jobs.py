"""
LinkedIn Jobs signal source — uses Apollo's people/org endpoints to surface
hiring signals. Uses LLM enrichment for semantic title matching rather than
exact substring comparison, catching variants like "Vice President of Sales"
matching ICP title "VP Sales".
"""

from __future__ import annotations

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

APOLLO_API_KEY = os.environ.get("APOLLO_API_KEY", "")
APOLLO_BASE_URL = "https://api.apollo.io/v1"


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
            return await self._fetch(domain, company_name, master_context)
        except Exception as exc:
            logger.warning("LinkedInJobsSource: failed for domain=%s: %s", domain, exc)
            return []

    async def _fetch(
        self, domain: str, company_name: str, master_context: MasterContext
    ) -> list[AccountSignal]:
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

        if not job_postings:
            return []

        # Collect all postings for LLM enrichment — don't filter upfront
        raw_jobs: list[dict] = []
        for job in job_postings[:15]:
            title = (job.get("title") or "").strip()
            if not title:
                continue

            posted_at_str = job.get("posted_at") or datetime.now(timezone.utc).isoformat()
            try:
                detected_at = datetime.fromisoformat(posted_at_str.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                detected_at = datetime.now(timezone.utc)

            raw_jobs.append({
                "id": str(uuid.uuid4()),
                "title": title,
                "url": job.get("url") or f"https://linkedin.com/jobs/search/?keywords={domain}",
                "detected_at": detected_at,
            })

        if not raw_jobs:
            return []

        icp_titles_str = ", ".join(master_context.buyers.titles[:10])
        candidates = [
            RawCandidate(
                id=j["id"],
                # Give the LLM both the title and the ICP context so it can judge semantic alignment
                content=(
                    f"Job posting title: {j['title']}. "
                    f"ICP buyer titles we care about: {icp_titles_str}."
                ),
                source_hint="job posting",
            )
            for j in raw_jobs
        ]
        enriched = await enrich_candidates(candidates, company_name, master_context)
        enriched_by_id = {e.id: e for e in enriched}

        signals: list[AccountSignal] = []
        for job in raw_jobs:
            result = enriched_by_id.get(job["id"])
            if result is None or not result.is_relevant:
                continue

            sig_type = result.signal_type or SignalType.RELEVANT_HIRE
            intent_level = result.intent_level or IntentLevel.MEDIUM

            if sig_type == SignalType.LEADERSHIP_HIRE:
                description = f"Leadership hire: {job['title']}"
            else:
                description = f"Hiring for ICP-aligned role: {job['title']}"

            signals.append(AccountSignal(
                signal_id=uuid.uuid4(),
                type=sig_type,
                intent_level=intent_level,
                description=description,
                source=SignalSource.LINKEDIN_JOBS,
                source_url=job["url"],
                detected_at=job["detected_at"],
                evidence_snippet=f"Open role at {domain}: {job['title']}",
            ))

        return signals
