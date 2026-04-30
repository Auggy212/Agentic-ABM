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
import uuid
from datetime import datetime, timezone
from typing import Optional

from backend.agents.signal_intel.classifier import classify_buying_stage, get_outreach_approach
from backend.agents.signal_intel.intel_report import generate_intel_report
from backend.agents.signal_intel.sources.crunchbase import CrunchbaseSignalSource
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
)

logger = logging.getLogger(__name__)

_CLAUDE_TOKEN_CAP = 200_000
_MAX_CONCURRENT = 5   # cap parallel Perplexity+Claude calls


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
            CrunchbaseSignalSource(),
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
            master_context = self._load_master_context(client_id)
            if master_context is None:
                logger.error("SignalIntelAgent: no MasterContext for client_id=%s", client_id)
                return {}

        reports: dict[str, SignalReport] = {}
        quota_warnings: list[dict] = []
        token_budget_used = 0
        intel_reports_generated = 0
        semaphore = asyncio.Semaphore(_MAX_CONCURRENT)

        async def process_account(account) -> None:
            nonlocal token_budget_used, intel_reports_generated

            domain = account.domain
            company_name = account.company_name
            tier = account.tier

            # ── Fetch signals from all sources concurrently ──────────────────
            if self._use_mock:
                from backend.agents.signal_intel.sources.mock import make_mock_signals
                signals = make_mock_signals(domain, tier, master_context)
            else:
                signal_tasks = [
                    src.fetch_signals(domain, company_name, master_context)
                    for src in self._sources
                ]
                results = await asyncio.gather(*signal_tasks, return_exceptions=True)
                signals = []
                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        logger.warning(
                            "SignalIntelAgent: source %s failed for domain=%s: %s",
                            self._sources[i].__class__.__name__, domain, result,
                        )
                    else:
                        signals.extend(result)  # type: ignore[arg-type]

            # ── Classify buying stage ────────────────────────────────────────
            stage, method, reasoning = await classify_buying_stage(signals)
            outreach = get_outreach_approach(stage)
            score = _compute_signal_score(signals)

            # ── Intel report (Tier 1 only, quota-guarded) ───────────────────
            intel_report = None
            if tier == AccountTier.TIER_1:
                if token_budget_used >= _CLAUDE_TOKEN_CAP:
                    quota_warnings.append({
                        "source": "CLAUDE",
                        "note": f"Token cap reached ({_CLAUDE_TOKEN_CAP}); intel report skipped for domain={domain}",
                    })
                else:
                    async with semaphore:
                        intel_report = await generate_intel_report(
                            company_name=company_name,
                            domain=domain,
                            buyer_intel=buyer_intel,
                            master_context=master_context,
                        )
                    # Rough token estimate: 1500 output tokens per report
                    token_budget_used += 1500
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

        await asyncio.gather(*[process_account(a) for a in account_list.accounts])

        # ── Persist ──────────────────────────────────────────────────────────
        self._persist(
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
            run_record = SignalIntelRunRecord(
                id=run_id,
                client_id=client_id,
                finished_at=datetime.now(timezone.utc),
                total_accounts=len(reports),
                quota_warnings=quota_warnings or None,
                status="complete_with_warnings" if quota_warnings else "complete",
            )
            db.add(run_record)

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
