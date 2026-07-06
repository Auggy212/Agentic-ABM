"""
Signal & Intelligence Agent orchestrator.

SignalIntelAgent.run(client_id, account_list, buyer_intel) -> dict[domain, SignalReport]

Per account (parallel, cap 5 concurrent):
  a) Fetch signals from all 5 sources concurrently
  b) Classify buying stage (hybrid rule/LLM)
  c) If TIER_1 → generate intel report (Perplexity → Claude)
  d) Persist SignalReport to DB

Quota guards:
  - Perplexity exhausted → skip intel report for remaining Tier 1s, flag in metadata
  - Claude token cap (200K/run) → same behaviour
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from backend.agents.signal_intel.classifier import classify_buying_stage, get_outreach_approach
from backend.agents.signal_intel.intel_report import generate_intel_report
from backend.agents.signal_intel.sources.web_scrape import WebScrapeSource
from backend.agents.signal_intel.sources.g2 import G2Source
from backend.agents.signal_intel.sources.google_news import GoogleNewsSource
from backend.agents.signal_intel.sources.linkedin_jobs import LinkedInJobsSource
from backend.agents.signal_intel.sources.reddit import RedditSource
from backend.db.session import SessionLocal
from backend.schemas.models import (
    AccountSignal,
    AccountTier,
    BuyerIntelPackage,
    ICPAccountList,
    IntentLevel,
    MasterContext,
    SignalReport,
    SignalScore,
    SignalType,
)

logger = logging.getLogger(__name__)

_CLAUDE_TOKEN_CAP = int(os.environ.get("SIGNAL_INTEL_TOKEN_CAP", "200000"))
_MAX_CONCURRENT = int(os.environ.get("SIGNAL_INTEL_MAX_CONCURRENT", "6"))
_ACCOUNT_CONCURRENCY = int(os.environ.get("SIGNAL_INTEL_ACCOUNT_CONCURRENCY", "10"))
_DB_CONCURRENCY = int(os.environ.get("SIGNAL_INTEL_DB_CONCURRENCY", "4"))
_SOURCE_FETCH_TIMEOUT = float(os.environ.get("SIGNAL_INTEL_SOURCE_TIMEOUT_SECS", "45.0"))
# Funding is only a live buying signal while it's fresh — drop FUNDING signals
# whose event date is older than this window.
_FUNDING_MAX_AGE_DAYS = int(os.environ.get("SIGNAL_INTEL_FUNDING_MAX_AGE_DAYS", "90"))


def _drop_stale_funding(signals: list[AccountSignal]) -> list[AccountSignal]:
    """Remove FUNDING signals whose event date is older than the max-age window.
    Non-funding signals and signals without a usable date are kept."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=_FUNDING_MAX_AGE_DAYS)
    kept: list[AccountSignal] = []
    for s in signals:
        if s.type == SignalType.FUNDING and s.detected_at is not None:
            dt = s.detected_at
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt < cutoff:
                continue
        kept.append(s)
    return kept


def _compute_signal_score(signals: list[AccountSignal]) -> SignalScore:
    high = sum(1 for s in signals if s.intent_level == IntentLevel.HIGH)
    medium = sum(1 for s in signals if s.intent_level == IntentLevel.MEDIUM)
    low = sum(1 for s in signals if s.intent_level == IntentLevel.LOW)
    total = high * 10 + medium * 4 + low * 1
    return SignalScore(high_count=high, medium_count=medium, low_count=low, total_score=total)


class SignalIntelAgent:
    """
    Fetches signals for all accounts and generates intel reports for Tier 1s.
    """

    def __init__(self, use_mock_sources: bool = False) -> None:
        self._use_mock = use_mock_sources
        self._sources = [
            LinkedInJobsSource(),
            GoogleNewsSource(),
            WebScrapeSource(),
            G2Source(),
            RedditSource(),
        ]

    async def run(
        self,
        client_id: str,
        account_list: ICPAccountList,
        buyer_intel: Optional[BuyerIntelPackage] = None,
        master_context: Optional[MasterContext] = None,
        run_id: Optional[str] = None,
    ) -> dict[str, SignalReport]:
        run_id = run_id or str(uuid.uuid4())

        # Need master_context to drive sources + classifier; load from DB if not passed
        if master_context is None:
            master_context = await asyncio.to_thread(self._load_master_context, client_id)
            if master_context is None:
                raise ValueError(
                    f"SignalIntelAgent: no MasterContext found for client_id={client_id!r}. "
                    "Run the intake agent first to create a MasterContext."
                )

        reports: dict[str, SignalReport] = {}
        quota_warnings: list[dict] = []
        token_budget_used = 0
        intel_reports_generated = 0
        intel_semaphore = asyncio.Semaphore(_MAX_CONCURRENT)
        account_semaphore = asyncio.Semaphore(_ACCOUNT_CONCURRENCY)
        db_semaphore = asyncio.Semaphore(_DB_CONCURRENCY)

        async def process_account(account) -> None:
            nonlocal token_budget_used, intel_reports_generated

            domain = account.domain
            company_name = account.company_name
            tier = account.tier

            async with account_semaphore:
                # ── Fetch signals from all sources concurrently ──────────────
                if self._use_mock:
                    from backend.agents.signal_intel.sources.mock import make_mock_signals
                    signals = make_mock_signals(domain, tier, master_context)
                else:
                    # Each source is timed out independently, so one slow/hanging
                    # source (e.g. a scraper being rate-limited) yields [] without
                    # discarding the results of the sources that already succeeded.
                    async def _fetch_one(src) -> list[AccountSignal]:
                        try:
                            return await asyncio.wait_for(
                                src.fetch_signals(domain, company_name, master_context),
                                timeout=_SOURCE_FETCH_TIMEOUT,
                            )
                        except asyncio.TimeoutError:
                            logger.warning(
                                "SignalIntelAgent: source %s timed out for domain=%s",
                                src.__class__.__name__, domain,
                            )
                            return []
                        except Exception as exc:
                            logger.warning(
                                "SignalIntelAgent: source %s failed for domain=%s: %s",
                                src.__class__.__name__, domain, exc,
                            )
                            return []

                    results = await asyncio.gather(
                        *[_fetch_one(src) for src in self._sources]
                    )
                    signals = []
                    for result in results:
                        signals.extend(result)

                # Funding older than the max-age window is stale — drop it.
                signals = _drop_stale_funding(signals)

                # ── Classify buying stage ────────────────────────────────────
                stage, method, reasoning = await classify_buying_stage(signals)
                outreach = get_outreach_approach(stage)
                score = _compute_signal_score(signals)

                # ── Intel report (Tier 1 only, quota-guarded) ────────────────
                intel_report = None
                if tier == AccountTier.TIER_1:
                    if token_budget_used >= _CLAUDE_TOKEN_CAP:
                        quota_warnings.append({
                            "source": "CLAUDE",
                            "note": f"Token cap reached ({_CLAUDE_TOKEN_CAP}); intel report skipped for domain={domain}",
                        })
                    else:
                        async with intel_semaphore:
                            intel_report = await generate_intel_report(
                                company_name=company_name,
                                domain=domain,
                                buyer_intel=buyer_intel,
                                master_context=master_context,
                                signals=signals,
                            )
                        if intel_report and hasattr(intel_report, "tokens_used") and intel_report.tokens_used:
                            token_budget_used += intel_report.tokens_used
                        else:
                            token_budget_used += 1500  # conservative estimate when actual count unavailable
                        if intel_report:
                            intel_reports_generated += 1

                report = SignalReport(
                    account_domain=domain,
                    tier=tier,
                    signals=signals,
                    signal_score=score,
                    buying_stage=stage,
                    buying_stage_method=method,
                    buying_stage_reasoning=reasoning,
                    recommended_outreach_approach=outreach,
                    intel_report=intel_report,
                )
                reports[domain] = report
                async with db_semaphore:
                    await asyncio.to_thread(
                        self._persist_one, client_id=client_id, domain=domain, report=report
                    )

        await asyncio.gather(*[process_account(a) for a in account_list.accounts])

        # ── Persist ──────────────────────────────────────────────────────────
        await asyncio.to_thread(
            self._persist,
            client_id=client_id,
            run_id=run_id,
            reports=reports,
            quota_warnings=quota_warnings,
        )

        logger.info(
            "SignalIntelAgent: run complete — %d accounts, %d intel reports, %d quota warnings",
            len(reports), intel_reports_generated, len(quota_warnings),
        )
        return reports

    def _load_master_context(self, client_id: str) -> Optional[MasterContext]:
        from backend.db.models import MasterContextRecord
        db = SessionLocal()
        try:
            record = (
                db.query(MasterContextRecord)
                .filter(MasterContextRecord.client_id == client_id)
                .order_by(MasterContextRecord.created_at.desc())
                .first()
            )
            if record:
                return MasterContext.model_validate(record.data)
            return None
        except Exception as exc:
            logger.error("SignalIntelAgent: failed to load MasterContext: %s", exc)
            return None
        finally:
            db.close()

    def _persist_one(self, *, client_id: str, domain: str, report: SignalReport) -> None:
        from backend.db.models import SignalReportRecord
        db = SessionLocal()
        try:
            report_dict = report.model_dump(mode="json")
            existing = (
                db.query(SignalReportRecord)
                .filter(
                    SignalReportRecord.client_id == client_id,
                    SignalReportRecord.account_domain == domain,
                )
                .first()
            )
            if existing:
                existing.data = report_dict
                existing.buying_stage = report.buying_stage.value
                existing.has_intel_report = report.intel_report is not None
                existing.updated_at = datetime.now(timezone.utc)
            else:
                db.add(SignalReportRecord(
                    id=str(uuid.uuid4()),
                    client_id=client_id,
                    account_domain=domain,
                    data=report_dict,
                    buying_stage=report.buying_stage.value,
                    has_intel_report=report.intel_report is not None,
                ))
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("SignalIntelAgent: failed to persist report for domain=%s", domain)
        finally:
            db.close()

    def _persist(
        self,
        *,
        client_id: str,
        run_id: str,
        reports: dict[str, SignalReport],
        quota_warnings: list[dict],
    ) -> None:
        from backend.db.models import SignalReportRecord, SignalIntelRunRecord
        db = SessionLocal()
        try:
            now = datetime.now(timezone.utc)
            final_status = "complete_with_warnings" if quota_warnings else "complete"
            run_record = db.query(SignalIntelRunRecord).filter(SignalIntelRunRecord.id == run_id).first()
            if run_record:
                run_record.finished_at = now
                run_record.total_accounts = len(reports)
                run_record.quota_warnings = quota_warnings or None
                run_record.status = final_status
            else:
                db.add(SignalIntelRunRecord(
                    id=run_id,
                    client_id=client_id,
                    finished_at=now,
                    total_accounts=len(reports),
                    quota_warnings=quota_warnings or None,
                    status=final_status,
                ))

            for domain, report in reports.items():
                report_dict = report.model_dump(mode="json")
                existing = (
                    db.query(SignalReportRecord)
                    .filter(
                        SignalReportRecord.client_id == client_id,
                        SignalReportRecord.account_domain == domain,
                    )
                    .first()
                )
                if existing:
                    existing.data = report_dict
                    existing.buying_stage = report.buying_stage.value
                    existing.has_intel_report = report.intel_report is not None
                    existing.updated_at = datetime.now(timezone.utc)
                else:
                    db.add(SignalReportRecord(
                        id=str(uuid.uuid4()),
                        client_id=client_id,
                        account_domain=domain,
                        data=report_dict,
                        buying_stage=report.buying_stage.value,
                        has_intel_report=report.intel_report is not None,
                    ))

            db.commit()
        except Exception:
            db.rollback()
            logger.exception("SignalIntelAgent: failed to persist run_id=%s", run_id)
        finally:
            db.close()
