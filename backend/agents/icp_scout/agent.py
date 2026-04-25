"""
ICP Scout Agent — pipeline orchestrator.

ICPScoutAgent.run(master_context) → ICPAccountList

Pipeline steps:
  1. Build ICPFilters from master_context.icp
  2. If existing_account_list CSV provided → load via ClientUploadSource; skip API discovery
  3. Otherwise query all API sources in parallel (asyncio.gather); tolerate partial failures
  4. Deduplicate by canonical domain (lowercase, strip www., strip trailing slash)
  5. Apply filter_negative_icp hard filter
  6. Score every account; assign tier
  7. Sort by score desc; cap at 300 accounts
  8. Emit ICPAccountList with run metadata and any quota warnings
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

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

    return ICPFilters(
        industries=list(icp.industries),
        employee_range=employee_range,
        locations=list(icp.geographies),
        technologies=list(icp.tech_stack_signals),
        funding_stages=list(icp.funding_stage),
        keywords=list(icp.buying_triggers),
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

        csv_path = master_context.gtm.existing_account_list
        if csv_path:
            logger.info("ICPScoutAgent: client upload detected — skipping API discovery")
            upload_source = ClientUploadSource(csv_path)
            raw_accounts = await upload_source.search(filters)
        else:
            results = await asyncio.gather(
                _safe_search("APOLLO", self._apollo, filters),
                _safe_search("HARMONIC", self._harmonic, filters),
                _safe_search("CRUNCHBASE", self._crunchbase, filters),
                _safe_search("BUILTWITH", self._builtwith, filters),
                return_exceptions=False,
            )

            for source_results, warning in results:
                raw_accounts.extend(source_results)
                if warning:
                    quota_warnings.append(warning)

        logger.info("ICPScoutAgent: %d raw accounts before dedup", len(raw_accounts))

        raw_accounts = _deduplicate(raw_accounts)
        logger.info("ICPScoutAgent: %d accounts after dedup", len(raw_accounts))

        raw_accounts = filter_negative_icp(raw_accounts, master_context)
        logger.info("ICPScoutAgent: %d accounts after negative_icp filter", len(raw_accounts))

        scored = [score_account(account, master_context) for account in raw_accounts]
        scored.sort(key=lambda s: s.icp_score, reverse=True)
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
        )

        logger.info(
            "ICPScoutAgent: run complete — %d accounts (T1=%d T2=%d T3=%d) quota_warnings=%d",
            len(icp_accounts), tier_1, tier_2, tier_3, len(quota_warnings),
        )

        return ICPAccountList(accounts=icp_accounts, meta=meta)
