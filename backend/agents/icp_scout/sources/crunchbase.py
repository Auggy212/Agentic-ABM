"""
Crunchbase source adapter.

Uses Crunchbase Basic API (organizations/search) to find companies by
industry, location, and funding stage. Returns up to 200 results/month
on the Basic tier.

API reference: https://data.crunchbase.com/docs/using-the-api
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

CRUNCHBASE_API_KEY: str = os.environ.get("CRUNCHBASE_API_KEY", "")
CRUNCHBASE_BASE_URL = "https://api.crunchbase.com/api/v4"
_NF = "not_found"
_PAGE_SIZE = 25


def _safe(d: dict, *keys: str, default: Any = _NF) -> Any:
    val = d
    for k in keys:
        if not isinstance(val, dict):
            return default
        val = val.get(k, default)
        if val is None:
            return default
    return val if val != "" else default


def _parse_headcount(props: dict) -> int | str:
    for key in ("num_employees_enum", "num_employees"):
        v = props.get(key)
        if isinstance(v, int) and v > 0:
            return v
        # Crunchbase sometimes returns "1-10", "11-50" etc.
        if isinstance(v, str) and "-" in v:
            try:
                return int(v.split("-")[1].strip())
            except (ValueError, IndexError):
                pass
    return _NF


def _parse_funding_round(props: dict) -> RawFundingRound:
    return RawFundingRound(
        round=props.get("last_funding_type") or _NF,
        amount_usd=props.get("last_funding_total") or _NF,
        date=props.get("last_funding_at") or _NF,
    )


def _parse_signals(props: dict) -> List[RawSignal]:
    signals: List[RawSignal] = []
    if props.get("last_funding_at"):
        signals.append(RawSignal(**{
            "type": "RECENT_FUNDING",
            "description": f"Last funding round: {props.get('last_funding_type', 'unknown')}",
            "date": props["last_funding_at"],
            "source_url": _NF,
        }))
    return signals


def _normalise(entity: dict) -> Optional[RawCompany]:
    props = entity.get("properties") or entity
    identifier = entity.get("identifier") or {}

    domain = (props.get("domain") or props.get("homepage_url") or "").strip().lower()
    domain = domain.replace("https://", "").replace("http://", "").rstrip("/").replace("www.", "")
    name = (identifier.get("value") or props.get("name") or "").strip()
    if not domain or not name:
        return None

    website = f"https://{domain}"
    loc = props.get("location_identifiers") or []
    hq_parts = [l.get("value", "") for l in loc if isinstance(l, dict)]
    hq = ", ".join(filter(None, hq_parts[:2])) or _NF

    return RawCompany(
        domain=domain,
        company_name=name,
        website=website,
        linkedin_url=None,
        industry=props.get("category_groups", [None])[0] if props.get("category_groups") else _NF,
        headcount=_parse_headcount(props),
        estimated_arr=_NF,
        funding_stage=props.get("last_funding_type") or _NF,
        last_funding_round=_parse_funding_round(props),
        hq_location=hq,
        technologies_used=[],  # Crunchbase Basic doesn't provide tech stack
        recent_signals=_parse_signals(props),
        source=DataSource.CRUNCHBASE,
        enriched_at=datetime.now(tz=timezone.utc),
    )


class CrunchbaseSource(BaseSource):
    source_id = DataSource.CRUNCHBASE

    def __init__(self, api_key: str = "") -> None:
        self._api_key = api_key or CRUNCHBASE_API_KEY

    async def search(self, filters: ICPFilters) -> List[RawCompany]:
        if not self._api_key:
            logger.warning("CrunchbaseSource: CRUNCHBASE_API_KEY not set — skipping")
            return []

        results: List[RawCompany] = []
        params = {"user_key": self._api_key}

        predicates: list[dict] = []
        if filters.locations:
            predicates.append({
                "field_id": "location_identifiers",
                "operator_id": "includes",
                "values": filters.locations,
            })
        if filters.funding_stages:
            predicates.append({
                "field_id": "last_funding_type",
                "operator_id": "includes",
                "values": filters.funding_stages,
            })

        body: dict = {
            "field_ids": [
                "name", "domain", "homepage_url", "last_funding_type",
                "last_funding_total", "last_funding_at", "num_employees_enum",
                "location_identifiers", "category_groups",
            ],
            "query": predicates,
            "limit": _PAGE_SIZE,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.post(
                    f"{CRUNCHBASE_BASE_URL}/searches/organizations",
                    params=params,
                    json=body,
                )
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as exc:
                logger.error("CrunchbaseSource HTTP %d: %s", exc.response.status_code, exc.response.text[:200])
                return []
            except Exception as exc:
                logger.error("CrunchbaseSource request failed: %s", exc)
                return []

            entities = data.get("entities") or []
            for entity in entities:
                company = _normalise(entity)
                if company:
                    results.append(company)

        logger.info("CrunchbaseSource: returned %d companies", len(results))
        return results
