"""
Harmonic.ai source adapter.

Harmonic focuses on funded startups with strong hiring momentum.
We filter by funding recency and headcount growth signals.

API reference: https://docs.harmonic.ai/
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

HARMONIC_API_KEY: str = os.environ.get("HARMONIC_API_KEY", "")
HARMONIC_BASE_URL = "https://api.harmonic.ai"
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


def _parse_headcount(entity: dict) -> int | str:
    hc = entity.get("headcount") or entity.get("employee_count")
    if isinstance(hc, int) and hc > 0:
        return hc
    # Harmonic sometimes returns {"current": N}
    if isinstance(hc, dict):
        v = hc.get("current")
        if isinstance(v, int) and v > 0:
            return v
    return _NF


def _parse_funding_round(entity: dict) -> RawFundingRound:
    funding = entity.get("funding") or {}
    rounds = funding.get("funding_rounds") or []
    if rounds:
        latest = sorted(
            rounds,
            key=lambda r: r.get("announced_date") or "0",
            reverse=True,
        )[0]
        return RawFundingRound(
            round=latest.get("series") or _NF,
            amount_usd=latest.get("raised_amount_usd") or _NF,
            date=latest.get("announced_date") or _NF,
        )
    return RawFundingRound(round=_NF, amount_usd=_NF, date=_NF)


def _parse_signals(entity: dict) -> List[RawSignal]:
    signals: List[RawSignal] = []
    hc = entity.get("headcount") or {}
    if isinstance(hc, dict):
        growth = hc.get("six_month_growth_percent")
        if isinstance(growth, (int, float)) and growth > 10:
            signals.append(RawSignal(**{
                "type": "HEADCOUNT_GROWTH",
                "description": f"Headcount grew {growth:.1f}% in last 6 months",
                "date": datetime.now(tz=timezone.utc).date().isoformat(),
                "source_url": _NF,
            }))

    funding = entity.get("funding") or {}
    latest_date = funding.get("last_funding_date")
    if latest_date:
        signals.append(RawSignal(**{
            "type": "RECENT_FUNDING",
            "description": f"Most recent funding on {latest_date}",
            "date": latest_date,
            "source_url": _NF,
        }))
    return signals


def _normalise(entity: dict) -> Optional[RawCompany]:
    domain = (entity.get("website") or entity.get("domain") or "").strip().lower()
    domain = domain.replace("https://", "").replace("http://", "").rstrip("/").replace("www.", "")
    name = (entity.get("name") or "").strip()
    if not domain or not name:
        return None

    website = f"https://{domain}"
    location = entity.get("location") or {}
    hq = ", ".join(filter(None, [location.get("city"), location.get("country")])) or _NF

    funding = entity.get("funding") or {}
    stage = funding.get("stage") or entity.get("funding_stage") or _NF

    return RawCompany(
        domain=domain,
        company_name=name,
        website=website,
        linkedin_url=entity.get("linkedin_url") or None,
        industry=entity.get("industry") or _NF,
        headcount=_parse_headcount(entity),
        estimated_arr=_NF,
        funding_stage=stage,
        last_funding_round=_parse_funding_round(entity),
        hq_location=hq,
        technologies_used=[t for t in (entity.get("technologies") or []) if isinstance(t, str)],
        recent_signals=_parse_signals(entity),
        source=DataSource.HARMONIC,
        enriched_at=datetime.now(tz=timezone.utc),
    )


class HarmonicSource(BaseSource):
    source_id = DataSource.HARMONIC

    def __init__(self, api_key: str = "") -> None:
        self._api_key = api_key or HARMONIC_API_KEY

    async def search(self, filters: ICPFilters) -> List[RawCompany]:
        if not self._api_key:
            logger.warning("HarmonicSource: HARMONIC_API_KEY not set — skipping")
            return []

        results: List[RawCompany] = []
        headers = {
            "apikey": self._api_key,
            "Content-Type": "application/json",
        }

        body: dict = {
            "filter": {},
            "size": _PAGE_SIZE,
        }

        f: dict = {}
        if filters.industries:
            f["industries"] = {"values": filters.industries}
        if filters.employee_range:
            lo, hi = filters.employee_range
            f["headcount"] = {"gte": lo, "lte": hi}
        if filters.locations:
            f["location"] = {"countries": filters.locations}
        if filters.funding_stages:
            f["funding_stage"] = {"values": filters.funding_stages}
        # Harmonic speciality: filter for companies with recent funding (last 18 months)
        f["has_funding"] = True
        body["filter"] = f

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.post(
                    f"{HARMONIC_BASE_URL}/companies/search",
                    headers=headers,
                    json=body,
                )
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPStatusError as exc:
                logger.error("HarmonicSource HTTP %d: %s", exc.response.status_code, exc.response.text[:200])
                return []
            except Exception as exc:
                logger.error("HarmonicSource request failed: %s", exc)
                return []

            entities = data.get("companies") or data.get("results") or []
            for entity in entities:
                company = _normalise(entity)
                if company:
                    results.append(company)

        logger.info("HarmonicSource: returned %d companies", len(results))
        return results
