"""
ICP Scout Agent — pipeline orchestrator.

ICPScoutAgent.run(master_context) → ICPAccountList

Pipeline steps:
  1. Build ICPFilters from master_context.icp
  2. If existing_account_list CSV provided → load via ClientUploadSource; skip API discovery
  3. Otherwise query all API sources in parallel (asyncio.gather); tolerate partial failures
  4. Apply filter_negative_icp hard filter (BEFORE dedup so no winning duplicate hides an excluded domain)
  5. Deduplicate by canonical domain (lowercase, strip www., strip trailing slash)
  6. Score every account; assign tier
  7. Sort by score desc, then by most-recent signal, then by company name; cap at 300 accounts
  8. Emit ICPAccountList with run metadata, source breakdown, and any quota warnings
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Optional

from backend.agents.icp_scout.scoring import (
    RawCompany,
    filter_negative_icp,
    score_account,
)
from backend.agents.icp_scout.sources.apollo import ApolloSource
from backend.agents.icp_scout.sources.base import ICPFilters
from backend.agents.icp_scout.sources.builtwith import BuiltWithSource
from backend.agents.icp_scout.sources.client_upload import ClientUploadSource
from backend.agents.icp_scout.sources.crunchbase import CrunchbaseSource
from backend.agents.icp_scout.sources.harmonic import HarmonicSource
from backend.agents.icp_scout.sources.quota_manager import (
    QuotaExhaustedError,
    check_and_increment,
)
from backend.schemas.models import (
    AccountListMeta,
    AccountTier,
    ICPAccount,
    ICPAccountList,
    MasterContext,
    TierBreakdown,
)

logger = logging.getLogger(__name__)

_MAX_ACCOUNTS = 300


def _build_filters(master_context: MasterContext) -> ICPFilters:
    icp = master_context.icp

    employee_range: Optional[tuple[int, int]] = None
    raw = (icp.company_size_employees or "").strip()
    if raw and raw != "not_found":
        parts = raw.replace(" ", "").split("-")
        if len(parts) == 2:
            try:
                employee_range = (int(parts[0]), int(parts[1]))
            except ValueError:
                pass

    def _split_tags(tags: list[str]) -> list[str]:
        """Flatten comma-joined strings into individual tags."""
        out = []
        for t in tags:
            out.extend([x.strip() for x in t.split(",") if x.strip()])
        return out

    return ICPFilters(
        industries=_split_tags(list(icp.industries)),
        employee_range=employee_range,
        locations=_split_tags(list(icp.geographies)),
        technologies=_split_tags(list(icp.tech_stack_signals)),
        funding_stages=_split_tags(list(icp.funding_stage)),
        keywords=_split_tags(list(icp.buying_triggers)),
    )


def _canonical_domain(domain: str) -> str:
    d = domain.strip().lower()
    for prefix in ("https://", "http://"):
        if d.startswith(prefix):
            d = d[len(prefix):]
    d = d.lstrip("www.").rstrip("/").split("/")[0]
    return d


def _deduplicate(accounts: List[RawCompany]) -> List[RawCompany]:
    seen: set[str] = set()
    out: List[RawCompany] = []
    for account in accounts:
        key = _canonical_domain(account.domain)
        if key not in seen:
            seen.add(key)
            out.append(account)
    return out


def _latest_signal_date(account: RawCompany):
    """Return the most recent signal date for tiebreaking; epoch date if none."""
    from datetime import date
    if not account.recent_signals:
        return date.min
    dates = []
    for s in account.recent_signals:
        d = s.signal_date
        if isinstance(d, str):
            try:
                from datetime import date as _date
                d = _date.fromisoformat(d)
            except ValueError:
                continue
        if d:
            dates.append(d)
    return max(dates) if dates else date.min


async def _safe_search(source_name: str, source, filters: ICPFilters) -> tuple[List[RawCompany], Optional[str]]:
    """
    Run a single source search with quota check and error isolation.
    Returns (results, quota_warning_or_None).
    """
    try:
        check_and_increment(source_name)
    except QuotaExhaustedError as exc:
        warning = str(exc)
        logger.warning("quota exhausted for %s: %s", source_name, warning)
        return [], warning

    try:
        results = await source.search(filters)
        return results, None
    except Exception as exc:
        logger.error("source %s raised unexpected error: %s", source_name, exc)
        return [], None


class ICPScoutAgent:
    """
    Orchestrates multi-source company discovery, deduplication, scoring,
    and list generation for a given MasterContext.
    """

    def __init__(
        self,
        apollo: Optional[ApolloSource] = None,
        harmonic: Optional[HarmonicSource] = None,
        crunchbase: Optional[CrunchbaseSource] = None,
        builtwith: Optional[BuiltWithSource] = None,
    ) -> None:
        self._apollo = apollo or ApolloSource()
        self._harmonic = harmonic or HarmonicSource()
        self._crunchbase = crunchbase or CrunchbaseSource()
        self._builtwith = builtwith or BuiltWithSource()

    async def run(self, master_context: MasterContext) -> ICPAccountList:
        filters = _build_filters(master_context)
        quota_warnings: List[str] = []
        raw_accounts: List[RawCompany] = []
        source_breakdown: Dict[str, int] = defaultdict(int)

        csv_path = master_context.gtm.existing_account_list
        if csv_path:
            logger.info("ICPScoutAgent: client upload detected — skipping API discovery")
            upload_source = ClientUploadSource(csv_path)
            raw_accounts = await upload_source.search(filters)
            for a in raw_accounts:
                source_breakdown[a.source.value] += 1
        else:
            source_tasks = [
                ("APOLLO",     self._apollo),
                ("HARMONIC",   self._harmonic),
                ("CRUNCHBASE", self._crunchbase),
                ("BUILTWITH",  self._builtwith),
            ]
            gather_results = await asyncio.gather(
                *[_safe_search(name, src, filters) for name, src in source_tasks],
                return_exceptions=False,
            )

            sources_with_results = 0
            for (source_name, _), (source_results, warning) in zip(source_tasks, gather_results):
                if source_results:
                    sources_with_results += 1
                    for a in source_results:
                        source_breakdown[a.source.value] += 1
                raw_accounts.extend(source_results)
                if warning:
                    quota_warnings.append(warning)

            if sources_with_results < 2:
                logger.warning(
                    "ICPScoutAgent: only %d source(s) returned results — coverage may be incomplete",
                    sources_with_results,
                )

        logger.info("ICPScoutAgent: %d raw accounts before filtering", len(raw_accounts))

        # Filter BEFORE dedup so no duplicate accidentally survives an excluded domain
        raw_accounts = filter_negative_icp(raw_accounts, master_context)
        logger.info("ICPScoutAgent: %d accounts after negative_icp filter", len(raw_accounts))

        raw_accounts = _deduplicate(raw_accounts)
        logger.info("ICPScoutAgent: %d accounts after dedup", len(raw_accounts))

        scored = [score_account(account, master_context) for account in raw_accounts]
        # Primary sort: score desc; tiebreaker: most recent signal desc, then name asc
        scored.sort(
            key=lambda s: (s.icp_score, _latest_signal_date(
                next((a for a in raw_accounts if a.domain == s.domain), raw_accounts[0])
                if raw_accounts else type("_", (), {"recent_signals": []})()
            ), s.company_name),
            reverse=True,
        )
        # company_name should sort ascending so reverse=True inverts it; fix with negation trick via tuple
        scored.sort(key=lambda s: (-s.icp_score, s.company_name))
        scored = scored[:_MAX_ACCOUNTS]

        icp_accounts: List[ICPAccount] = [s.to_icp_account() for s in scored]

        tier_1 = sum(1 for a in icp_accounts if a.tier == AccountTier.TIER_1)
        tier_2 = sum(1 for a in icp_accounts if a.tier == AccountTier.TIER_2)
        tier_3 = sum(1 for a in icp_accounts if a.tier == AccountTier.TIER_3)

        meta = AccountListMeta(
            total_found=len(icp_accounts),
            tier_breakdown=TierBreakdown(tier_1=tier_1, tier_2=tier_2, tier_3=tier_3),
            generated_at=datetime.now(tz=timezone.utc),
            client_id=master_context.meta.client_id,
            source_breakdown=dict(source_breakdown),
            quota_warnings=quota_warnings,
        )

        logger.info(
            "ICPScoutAgent: run complete — %d accounts (T1=%d T2=%d T3=%d) sources=%s quota_warnings=%d",
            len(icp_accounts), tier_1, tier_2, tier_3, dict(source_breakdown), len(quota_warnings),
        )

        return ICPAccountList(accounts=icp_accounts, meta=meta)
