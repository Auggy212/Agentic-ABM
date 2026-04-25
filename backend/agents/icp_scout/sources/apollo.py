"""
Apollo.io source adapter.

Uses the v1/mixed_companies/search endpoint to find companies matching
the ICP filters. Each result is normalised into a RawCompany.

Free tier: 50 exports/month. Quota is enforced by the caller via quota_manager
before this adapter is invoked.

API reference: https://apolloio.github.io/apollo-api-docs/
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

APOLLO_API_KEY: str = os.environ.get("APOLLO_API_KEY", "")
APOLLO_BASE_URL = "https://api.apollo.io/v1"
_NF = "not_found"
_PAGE_SIZE = 25          # Apollo free tier returns up to 25 per page
_MAX_PAGES = 2           # cap at 2 pages (50 results) per free-tier call


def _safe(d: dict, *keys: str, default: Any = _NF) -> Any:
    """Safe nested dict access — returns default rather than raising."""
    val = d
    for k in keys:
        if not isinstance(val, dict):
            return default
        val = val.get(k, default)
        if val is None:
            return default
    return val if val != "" else default


def _parse_headcount(org: dict) -> int | str:
    """Map Apollo employee_count or estimated_num_employees to int or 'not_found'."""
    for key in ("employee_count", "estimated_num_employees"):
        v = org.get(key)
        if isinstance(v, int) and v > 0:
            return v
    return _NF


def _parse_funding_round(org: dict) -> RawFundingRound:
    latest = org.get("latest_funding_round") or {}
    round_type = _safe(latest, "round_name", default=_NF)
    amount = latest.get("amount_in_cents")
    if isinstance(amount, int):
        amount = amount // 100  # cents → USD
    else:
        amount = _NF
    announced = latest.get("announced_on") or _NF
    return RawFundingRound(round=round_type, amount_usd=amount, date=announced)


def _parse_signals(org: dict) -> List[RawSignal]:
    signals: List[RawSignal] = []
    # Apollo surfaces job postings count — we synthesise a signal if significant
    job_count = org.get("job_postings_count") or 0
    if isinstance(job_count, int) and job_count >= 3:
        signals.append(RawSignal(**{
            "type": "JOB_POSTINGS",
            "description": f"{job_count} active job postings detected",
            "date": datetime.now(tz=timezone.utc).date().isoformat(),
            "source_url": f"https://app.apollo.io/#/companies/{org.get('id', '')}",
        }))
    return signals


def _normalise(org: dict) -> Optional[RawCompany]:
    """Map a single Apollo organisation object to a RawCompany. Returns None if unusable."""
    domain = (org.get("primary_domain") or "").strip().lower()
    name = (org.get("name") or "").strip()
    if not domain or not name:
        return None

    # Ensure domain has no scheme
    domain = domain.replace("https://", "").replace("http://", "").rstrip("/")

    website = org.get("website_url") or f"https://{domain}"
    if not website.startswith("http"):
        website = f"https://{website}"

    return RawCompany(
        domain=domain,
        company_name=name,
        website=website,
        linkedin_url=org.get("linkedin_url") or None,
        industry=org.get("industry") or _NF,
        headcount=_parse_headcount(org),
        estimated_arr=_NF,           # Apollo free tier doesn't expose ARR
        funding_stage=org.get("latest_funding_round_type") or _NF,
        last_funding_round=_parse_funding_round(org),
        hq_location=(
            ", ".join(filter(None, [org.get("city"), org.get("country")]))
            or _NF
        ),
        technologies_used=[t.get("name", "") for t in (org.get("technologies") or []) if t.get("name")],
        recent_signals=_parse_signals(org),
        source=DataSource.APOLLO,
        enriched_at=datetime.now(tz=timezone.utc),
    )


class ApolloSource(BaseSource):
    source_id = DataSource.APOLLO

    def __init__(self, api_key: str = "") -> None:
        self._api_key = api_key or APOLLO_API_KEY

    async def search(self, filters: ICPFilters) -> List[RawCompany]:
        if not self._api_key:
            logger.warning("ApolloSource: APOLLO_API_KEY not set — skipping")
            return []

        results: List[RawCompany] = []
        headers = {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": self._api_key,
        }

        # Build query body
        body: dict = {
            "per_page": _PAGE_SIZE,
            "page": 1,
        }
        if filters.industries:
            body["organization_industry_tag_ids"] = filters.industries  # Apollo accepts string tags too
        if filters.employee_range:
            lo, hi = filters.employee_range
            body["organization_num_employees_ranges"] = [f"{lo},{hi}"]
        if filters.locations:
            body["organization_locations"] = filters.locations
        if filters.technologies:
            body["currently_using_any_of_technology_uids"] = filters.technologies
        if filters.funding_stages:
            body["organization_latest_funding_stage_cd"] = filters.funding_stages

        async with httpx.AsyncClient(timeout=30.0) as client:
            for page in range(1, _MAX_PAGES + 1):
                body["page"] = page
                try:
                    resp = await client.post(
                        f"{APOLLO_BASE_URL}/mixed_companies/search",
                        headers=headers,
                        json=body,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                except httpx.HTTPStatusError as exc:
                    logger.error("ApolloSource HTTP %d: %s", exc.response.status_code, exc.response.text[:200])
                    break
                except Exception as exc:
                    logger.error("ApolloSource request failed: %s", exc)
                    break

                orgs = data.get("organizations") or []
                if not orgs:
                    break

                for org in orgs:
                    company = _normalise(org)
                    if company:
                        results.append(company)

                pagination = data.get("pagination") or {}
                total_pages = pagination.get("total_pages", 1)
                if page >= total_pages:
                    break

        logger.info("ApolloSource: returned %d companies", len(results))
        return results
