"""
Crunchbase signal source — fetches recent funding events (last 60 days).

Reuses the existing icp_scout Crunchbase module's HTTP pattern but targets
the funding rounds endpoint for the signal agent's purpose.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

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

CRUNCHBASE_API_KEY = os.environ.get("CRUNCHBASE_API_KEY", "")
CRUNCHBASE_BASE_URL = "https://api.crunchbase.com/api/v4"

_LOOKBACK_DAYS = 60


class CrunchbaseSignalSource(BaseSignalSource):
    async def fetch_signals(
        self,
        domain: str,
        company_name: str,
        master_context: MasterContext,
    ) -> list[AccountSignal]:
        if not CRUNCHBASE_API_KEY:
            logger.warning("CrunchbaseSignalSource: CRUNCHBASE_API_KEY not set")
            return []
        try:
            return await self._fetch(domain, company_name)
        except Exception as exc:
            logger.warning("CrunchbaseSignalSource: failed for domain=%s: %s", domain, exc)
            return []

    async def _fetch(self, domain: str, company_name: str) -> list[AccountSignal]:
        cutoff = datetime.now(timezone.utc) - timedelta(days=_LOOKBACK_DAYS)
        signals: list[AccountSignal] = []

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                f"{CRUNCHBASE_BASE_URL}/entities/organizations/{domain.split('.')[0]}",
                params={
                    "user_key": CRUNCHBASE_API_KEY,
                    "field_ids": "funding_rounds,short_description",
                },
            )
            if resp.status_code != 200:
                return []
            data = resp.json()

        rounds = (data.get("properties") or {}).get("funding_rounds") or []

        for round_data in rounds:
            announced_on = round_data.get("announced_on") or ""
            if not announced_on:
                continue
            try:
                round_date = datetime.fromisoformat(announced_on + "T00:00:00+00:00")
            except ValueError:
                continue

            if round_date < cutoff:
                continue

            amount = round_data.get("money_raised", {})
            amount_usd = amount.get("value_usd", 0) if isinstance(amount, dict) else 0
            round_type = round_data.get("investment_type", "funding round").replace("_", " ").title()
            amount_str = f"${amount_usd:,.0f}" if amount_usd else "undisclosed amount"

            signals.append(AccountSignal(
                signal_id=uuid.uuid4(),
                type=SignalType.FUNDING,
                intent_level=IntentLevel.HIGH,
                description=f"{company_name} raised {amount_str} in a {round_type}",
                source=SignalSource.CRUNCHBASE,
                source_url=f"https://www.crunchbase.com/organization/{domain.split('.')[0]}",
                detected_at=round_date,
                evidence_snippet=(
                    f"{round_type} of {amount_str} announced on {announced_on}. "
                    f"Companies that have recently raised funding are actively investing in new tools."
                )[:500],
            ))

        return signals
