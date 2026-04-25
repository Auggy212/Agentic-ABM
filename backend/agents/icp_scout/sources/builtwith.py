"""
BuiltWith source adapter.

BuiltWith specialises in technology-stack detection. We query by technology
keyword (e.g., "HubSpot") to find companies using the client's tech signals.
Returns domains + detected technologies.

API reference: https://api.builtwith.com/
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from backend.agents.icp_scout.scoring import RawCompany, RawFundingRound, RawSignal
from backend.agents.icp_scout.sources.base import BaseSource, ICPFilters
from backend.schemas.models import DataSource

logger = logging.getLogger(__name__)

BUILTWITH_API_KEY: str = os.environ.get("BUILTWITH_API_KEY", "")
BUILTWITH_BASE_URL = "https://api.builtwith.com"
_NF = "not_found"
_MAX_LOOKUPS = 10   # limit number of technology lookups per run to conserve quota


def _normalise(result: dict, tech_name: str) -> Optional[RawCompany]:
    """Map a single BuiltWith result entry to a RawCompany."""
    domain = (result.get("Domain") or result.get("domain") or "").strip().lower()
    domain = domain.replace("https://", "").replace("http://", "").rstrip("/").replace("www.", "")
    if not domain:
        return None

    name = result.get("CompanyName") or result.get("company_name") or domain

    # Gather all detected technology names from the result
    techs: List[str] = []
    for path_group in result.get("Result", {}).get("Paths", []):
        for tech in path_group.get("Technologies", []):
            t_name = tech.get("Name")
            if t_name:
                techs.append(t_name)

    # Always include the queried technology if not already present
    if tech_name and tech_name not in techs:
        techs.insert(0, tech_name)

    return RawCompany(
        domain=domain,
        company_name=name,
        website=f"https://{domain}",
        linkedin_url=None,
        industry=_NF,       # BuiltWith doesn't provide industry
        headcount=_NF,
        estimated_arr=_NF,
        funding_stage=_NF,
        last_funding_round=RawFundingRound(round=_NF, amount_usd=_NF, date=_NF),
        hq_location=_NF,
        technologies_used=list(dict.fromkeys(techs)),   # deduplicate preserving order
        recent_signals=[],
        source=DataSource.BUILTWITH,
        enriched_at=datetime.now(tz=timezone.utc),
    )


class BuiltWithSource(BaseSource):
    source_id = DataSource.BUILTWITH

    def __init__(self, api_key: str = "") -> None:
        self._api_key = api_key or BUILTWITH_API_KEY

    async def search(self, filters: ICPFilters) -> List[RawCompany]:
        if not self._api_key:
            logger.warning("BuiltWithSource: BUILTWITH_API_KEY not set — skipping")
            return []
        if not filters.technologies:
            logger.info("BuiltWithSource: no tech_stack_signals in ICP — skipping")
            return []

        results: List[RawCompany] = []
        seen_domains: set[str] = set()

        async with httpx.AsyncClient(timeout=30.0) as client:
            for tech in filters.technologies[:_MAX_LOOKUPS]:
                try:
                    resp = await client.get(
                        f"{BUILTWITH_BASE_URL}/v19/api.json",
                        params={
                            "KEY": self._api_key,
                            "TECH": tech,
                            "LIMIT": 20,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                except httpx.HTTPStatusError as exc:
                    logger.error("BuiltWithSource HTTP %d for tech=%r: %s", exc.response.status_code, tech, exc.response.text[:200])
                    continue
                except Exception as exc:
                    logger.error("BuiltWithSource request failed for tech=%r: %s", tech, exc)
                    continue

                for entry in (data.get("Results") or []):
                    company = _normalise(entry, tech)
                    if company and company.domain not in seen_domains:
                        seen_domains.add(company.domain)
                        results.append(company)

        logger.info("BuiltWithSource: returned %d unique companies", len(results))
        return results
