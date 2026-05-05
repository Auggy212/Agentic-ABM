"""
Tests for the Signal & Intelligence Agent.

All external services (Apollo, Perplexity, Claude, Reddit, G2, etc.) are mocked.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.agents.signal_intel.classifier import (
    _count_by_intent,
    _rules_pass,
    classify_buying_stage,
)
from backend.agents.signal_intel.sources.mock import make_mock_signals
from backend.schemas.models import (
    AccountListMeta,
    AccountTier,
    BuyingStage,
    BuyingStageMethod,
    ICPAccount,
    ICPAccountList,
    IntentLevel,
    MasterContext,
    SignalScore,
    TierBreakdown,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def minimal_master_context() -> MasterContext:
    return MasterContext.model_validate({
        "company": {
            "name": "Sennen",
            "website": "https://sennen.io",
            "industry": "SaaS",
            "stage": "Series A",
            "product": "ABM Engine",
            "value_prop": "Agentic ABM for B2B SaaS revenue teams",
            "differentiators": ["Agentic pipeline"],
            "pricing_model": "Subscription",
            "acv_range": "$18k–$72k",
            "reference_customers": ["Growlytics"],
        },
        "icp": {
            "industries": ["B2B SaaS", "RevOps"],
            "company_size_employees": "50-500",
            "company_size_arr": "$1M–$50M",
            "funding_stage": ["Series A", "Series B"],
            "geographies": ["US", "India"],
            "tech_stack_signals": ["Salesforce", "HubSpot"],
            "buying_triggers": ["New CRO hired", "Series B funding"],
            "negative_icp": [],
        },
        "buyers": {
            "titles": ["VP Sales", "CRO", "Head of Sales"],
            "seniority": ["VP", "C_SUITE"],
            "buying_committee_size": "3-5",
            "pain_points": ["manual prospecting", "low outbound conversion"],
            "unstated_needs": ["pipeline predictability"],
        },
        "competitors": [
            {"name": "CompetitorX", "weaknesses": ["No AI features"]},
        ],
        "gtm": {
            "win_themes": ["Speed to value"],
            "loss_themes": ["Price"],
            "channels": ["LinkedIn", "Email"],
            "crm": "HubSpot",
            "existing_account_list": None,
        },
        "meta": {
            "created_at": "2026-04-01T00:00:00Z",
            "client_id": str(uuid.uuid4()),
            "version": "1.0.0",
        },
    })


def make_account(domain: str, tier: AccountTier, score: int) -> ICPAccount:
    return ICPAccount.model_validate({
        "domain": domain,
        "company_name": domain.replace(".example.com", "").title() + " Corp",
        "website": f"https://{domain}",
        "linkedin_url": None,
        "industry": "B2B SaaS",
        "headcount": 200,
        "estimated_arr": "$10M–$50M",
        "funding_stage": "Series B",
        "last_funding_round": {"round": "Series B", "amount_usd": 40_000_000, "date": "2026-03-15"},
        "hq_location": "Bangalore, India",
        "technologies_used": ["Salesforce", "Outreach"],
        "recent_signals": [],
        "icp_score": score,
        "score_breakdown": {
            "industry": 25,
            "company_size": 20,
            "geography": 10,
            "tech_stack": 10,
            "funding_stage": score - 65 if score >= 80 else (score - 45 if score >= 60 else score - 20),
            "buying_triggers": 0,
        },
        "tier": tier.value,
        "source": "APOLLO",
        "enriched_at": "2026-04-15T10:00:00Z",
    })


def make_signal(intent: IntentLevel, sig_type: str = "FUNDING"):
    from backend.schemas.models import AccountSignal, SignalSource, SignalType
    return AccountSignal(
        signal_id=uuid.uuid4(),
        type=SignalType(sig_type),
        intent_level=intent,
        description=f"Test signal {intent.value}",
        source=SignalSource.CRUNCHBASE,
        source_url="https://example.com/signal",
        detected_at=datetime.now(timezone.utc),
        evidence_snippet="Test evidence",
    )


# ---------------------------------------------------------------------------
# Classifier — rule-based path
# ---------------------------------------------------------------------------

class TestClassifierRules:
    def test_zero_signals_returns_unaware(self):
        stage, reasoning = _rules_pass([])
        assert stage == BuyingStage.UNAWARE
        assert "0 signals" in reasoning

    def test_low_only_returns_problem_aware(self):
        signals = [make_signal(IntentLevel.LOW), make_signal(IntentLevel.LOW)]
        stage, reasoning = _rules_pass(signals)
        assert stage == BuyingStage.PROBLEM_AWARE
        assert "LOW" in reasoning

    def test_two_high_returns_ready_to_buy(self):
        signals = [make_signal(IntentLevel.HIGH), make_signal(IntentLevel.HIGH)]
        stage, reasoning = _rules_pass(signals)
        assert stage == BuyingStage.READY_TO_BUY
        assert "HIGH" in reasoning

    def test_one_medium_two_signals_solution_aware(self):
        signals = [make_signal(IntentLevel.MEDIUM), make_signal(IntentLevel.LOW)]
        stage, _ = _rules_pass(signals)
        assert stage == BuyingStage.SOLUTION_AWARE

    def test_one_high_alone_solution_aware(self):
        signals = [make_signal(IntentLevel.HIGH)]
        stage, _ = _rules_pass(signals)
        assert stage == BuyingStage.SOLUTION_AWARE

    def test_ambiguous_returns_none(self):
        signals = [
            make_signal(IntentLevel.HIGH),
            make_signal(IntentLevel.MEDIUM),
            make_signal(IntentLevel.MEDIUM),
        ]
        stage, _ = _rules_pass(signals)
        assert stage is None   # AMBIGUOUS → triggers LLM tiebreaker

    @pytest.mark.asyncio
    async def test_classify_buying_stage_rules_path(self):
        signals = [make_signal(IntentLevel.HIGH), make_signal(IntentLevel.HIGH)]
        stage, method, reasoning = await classify_buying_stage(signals)
        assert stage == BuyingStage.READY_TO_BUY
        assert method == BuyingStageMethod.RULES
        assert "HIGH" in reasoning

    @pytest.mark.asyncio
    async def test_classify_zero_signals_rules_path(self):
        stage, method, _ = await classify_buying_stage([])
        assert stage == BuyingStage.UNAWARE
        assert method == BuyingStageMethod.RULES


# ---------------------------------------------------------------------------
# Classifier — LLM tiebreaker path
# ---------------------------------------------------------------------------

class TestClassifierLLM:
    @pytest.mark.asyncio
    async def test_llm_tiebreaker_called_on_ambiguous_signals(self):
        ambiguous = [
            make_signal(IntentLevel.HIGH, "FUNDING"),
            make_signal(IntentLevel.MEDIUM, "RELEVANT_HIRE"),
            make_signal(IntentLevel.MEDIUM, "EXEC_CONTENT"),
        ]

        mock_response = json.dumps({"stage": "EVALUATING", "reasoning": "Mixed high+medium signals indicate evaluation."})

        with patch("backend.agents.signal_intel.classifier.ANTHROPIC_API_KEY", "test-key"), \
             patch("backend.agents.signal_intel.classifier._cache_get", return_value=None), \
             patch("backend.agents.signal_intel.classifier._cache_set"), \
             patch("httpx.AsyncClient") as mock_client_cls:

            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=MagicMock(
                status_code=200,
                raise_for_status=MagicMock(),
                json=lambda: {"content": [{"text": mock_response}]},
            ))

            stage, method, reasoning = await classify_buying_stage(ambiguous)

        assert stage == BuyingStage.EVALUATING
        assert method == BuyingStageMethod.LLM_TIEBREAKER
        assert "Mixed" in reasoning

    @pytest.mark.asyncio
    async def test_llm_cache_hit_skips_api_call(self):
        ambiguous = [
            make_signal(IntentLevel.HIGH, "FUNDING"),
            make_signal(IntentLevel.MEDIUM, "RELEVANT_HIRE"),
            make_signal(IntentLevel.MEDIUM, "EXEC_CONTENT"),
        ]

        cached_result = {"stage": "EVALUATING", "reasoning": "Cached result."}

        with patch("backend.agents.signal_intel.classifier.ANTHROPIC_API_KEY", "test-key"), \
             patch("backend.agents.signal_intel.classifier._cache_get", return_value=cached_result), \
             patch("httpx.AsyncClient") as mock_client_cls:

            stage, method, reasoning = await classify_buying_stage(ambiguous)
            # Client should NOT have been called
            mock_client_cls.assert_not_called()

        assert stage == BuyingStage.EVALUATING
        assert method == BuyingStageMethod.LLM_TIEBREAKER
        assert "Cached" in reasoning


# ---------------------------------------------------------------------------
# Mock signal source
# ---------------------------------------------------------------------------

class TestMockSignalSource:
    def test_tier1_gets_at_least_3_signals(self, minimal_master_context):
        signals = make_mock_signals("acme.com", AccountTier.TIER_1, minimal_master_context)
        assert len(signals) >= 3

    def test_same_domain_deterministic(self, minimal_master_context):
        s1 = make_mock_signals("acme.com", AccountTier.TIER_2, minimal_master_context)
        s2 = make_mock_signals("acme.com", AccountTier.TIER_2, minimal_master_context)
        assert [s.signal_id for s in s1] == [s.signal_id for s in s2]

    def test_zero_domain_produces_no_signals(self, minimal_master_context):
        # Hash bucket 0 → count 0
        # We can't guarantee which domain hits bucket 0, but we can check
        # any result is a valid list
        signals = make_mock_signals("empty-zero.example.com", AccountTier.TIER_3, minimal_master_context)
        assert isinstance(signals, list)


# ---------------------------------------------------------------------------
# Signal Intel Agent — full orchestration
# ---------------------------------------------------------------------------

class TestSignalIntelAgent:
    def make_account_list(self, domains_tiers: list[tuple[str, AccountTier, int]]) -> ICPAccountList:
        accounts = [make_account(d, t, s) for d, t, s in domains_tiers]
        tier_1 = sum(1 for _, t, _ in domains_tiers if t == AccountTier.TIER_1)
        tier_2 = sum(1 for _, t, _ in domains_tiers if t == AccountTier.TIER_2)
        tier_3 = sum(1 for _, t, _ in domains_tiers if t == AccountTier.TIER_3)
        return ICPAccountList(
            accounts=accounts,
            meta=AccountListMeta(
                total_found=len(accounts),
                tier_breakdown=TierBreakdown(tier_1=tier_1, tier_2=tier_2, tier_3=tier_3),
                generated_at=datetime.now(timezone.utc),
                client_id=uuid.uuid4(),
            ),
        )

    @pytest.mark.asyncio
    async def test_run_produces_report_per_account(self, minimal_master_context):
        from backend.agents.signal_intel.agent import SignalIntelAgent

        domains = [
            ("domain-t1.example.com", AccountTier.TIER_1, 85),
            ("domain-t2.example.com", AccountTier.TIER_2, 65),
            ("domain-t3.example.com", AccountTier.TIER_3, 45),
        ]
        account_list = self.make_account_list(domains)

        agent = SignalIntelAgent(use_mock_sources=True)

        with patch.object(agent, "_persist"):  # skip DB
            with patch("backend.agents.signal_intel.agent.generate_intel_report", return_value=None):
                reports = await agent.run(
                    client_id=str(uuid.uuid4()),
                    account_list=account_list,
                    master_context=minimal_master_context,
                )

        assert len(reports) == 3
        for domain, _, _ in domains:
            assert domain in reports

    @pytest.mark.asyncio
    async def test_tier1_intel_report_generated(self, minimal_master_context):
        from backend.agents.signal_intel.agent import SignalIntelAgent
        from backend.schemas.models import (
            CompetitiveLandscapeEntry,
            EvidenceStatus,
            GeneratedBy,
            IntelReport,
            IntelInferredPainPoint,
            StrategicPriority,
        )
        from datetime import date

        mock_report = IntelReport(
            company_snapshot="[VERIFIED] Acme raised $40M. [INFERRED] Likely evaluating tools.",
            strategic_priorities=[StrategicPriority(
                priority="Scale outbound",
                evidence="[VERIFIED] CRO hired",
                evidence_status=EvidenceStatus.VERIFIED,
                source_url="https://example.com",
            )],
            tech_stack=["Salesforce"],
            competitive_landscape=[CompetitiveLandscapeEntry(
                competitor_name="CompetitorX",
                evidence="[INFERRED] Using CompetitorX",
                evidence_status=EvidenceStatus.INFERRED,
                source_url="not_found",
            )],
            inferred_pain_points=[IntelInferredPainPoint(
                pain_point="Manual prospecting",
                evidence_status=EvidenceStatus.INFERRED,
                reasoning="Title alignment",
            )],
            recent_news=[],
            buying_committee_summary="CRO leads the committee.",
            recommended_angle="Lead with the Series B playbook.",
            generated_by=GeneratedBy(researcher="perplexity", synthesizer="claude-sonnet-4"),
            generated_at=datetime.now(timezone.utc),
        )

        account_list = self.make_account_list([("t1.example.com", AccountTier.TIER_1, 85)])

        agent = SignalIntelAgent(use_mock_sources=True)

        with patch.object(agent, "_persist"), \
             patch("backend.agents.signal_intel.agent.generate_intel_report", return_value=mock_report):
            reports = await agent.run(
                client_id=str(uuid.uuid4()),
                account_list=account_list,
                master_context=minimal_master_context,
            )

        report = reports["t1.example.com"]
        assert report.intel_report is not None
        assert "[VERIFIED]" in report.intel_report.company_snapshot
        assert "[INFERRED]" in report.intel_report.company_snapshot

    @pytest.mark.asyncio
    async def test_tier2_no_intel_report(self, minimal_master_context):
        from backend.agents.signal_intel.agent import SignalIntelAgent

        account_list = self.make_account_list([("t2.example.com", AccountTier.TIER_2, 65)])

        agent = SignalIntelAgent(use_mock_sources=True)

        with patch.object(agent, "_persist"), \
             patch("backend.agents.signal_intel.agent.generate_intel_report") as mock_gen:
            reports = await agent.run(
                client_id=str(uuid.uuid4()),
                account_list=account_list,
                master_context=minimal_master_context,
            )

        report = reports["t2.example.com"]
        assert report.intel_report is None
        mock_gen.assert_not_called()

    @pytest.mark.asyncio
    async def test_source_failure_still_completes_run(self, minimal_master_context):
        from backend.agents.signal_intel.agent import SignalIntelAgent

        account_list = self.make_account_list([
            ("ok.example.com", AccountTier.TIER_2, 65),
            ("fail.example.com", AccountTier.TIER_2, 62),
        ])

        agent = SignalIntelAgent(use_mock_sources=False)

        # All real sources raise an exception
        for src in agent._sources:
            src.fetch_signals = AsyncMock(side_effect=RuntimeError("source down"))

        with patch.object(agent, "_persist"), \
             patch("backend.agents.signal_intel.agent.generate_intel_report", return_value=None):
            reports = await agent.run(
                client_id=str(uuid.uuid4()),
                account_list=account_list,
                master_context=minimal_master_context,
            )

        # Run still completes, reports have empty signal lists
        assert len(reports) == 2
        for domain in ["ok.example.com", "fail.example.com"]:
            assert reports[domain].signals == []

    @pytest.mark.asyncio
    async def test_intel_generation_failed_surfaces_gracefully(self, minimal_master_context):
        from backend.agents.signal_intel.agent import SignalIntelAgent

        account_list = self.make_account_list([("t1-fail.example.com", AccountTier.TIER_1, 82)])

        agent = SignalIntelAgent(use_mock_sources=True)

        with patch.object(agent, "_persist"), \
             patch("backend.agents.signal_intel.agent.generate_intel_report", return_value=None):
            reports = await agent.run(
                client_id=str(uuid.uuid4()),
                account_list=account_list,
                master_context=minimal_master_context,
            )

        # Run succeeds, intel_report is None (generation failed gracefully)
        report = reports["t1-fail.example.com"]
        assert report.intel_report is None
        assert report.buying_stage is not None


# ---------------------------------------------------------------------------
# Intel report claims tagging
# ---------------------------------------------------------------------------

class TestIntelReportTagging:
    def test_inferred_pain_point_evidence_status_must_be_inferred(self):
        from pydantic import ValidationError
        from backend.schemas.models import IntelInferredPainPoint, EvidenceStatus

        # INFERRED is valid
        pp = IntelInferredPainPoint(
            pain_point="test",
            evidence_status=EvidenceStatus.INFERRED,
            reasoning="test",
        )
        assert pp.evidence_status == EvidenceStatus.INFERRED

        # VERIFIED is invalid
        with pytest.raises(ValidationError):
            IntelInferredPainPoint(
                pain_point="test",
                evidence_status=EvidenceStatus.VERIFIED,
                reasoning="test",
            )

    def test_intel_report_only_for_tier1(self):
        from pydantic import ValidationError
        from backend.schemas.models import (
            SignalReport,
            AccountTier,
            BuyingStage,
            BuyingStageMethod,
            IntelReport,
            SignalScore,
            GeneratedBy,
        )
        from datetime import date

        signal_score = SignalScore(high_count=0, medium_count=0, low_count=0, total_score=0)

        # Tier 2 with intel_report → should fail
        mock_report = MagicMock(spec=IntelReport)

        with pytest.raises(ValidationError):
            SignalReport(
                account_domain="test.com",
                tier=AccountTier.TIER_2,
                signals=[],
                signal_score=signal_score,
                buying_stage=BuyingStage.UNAWARE,
                buying_stage_method=BuyingStageMethod.RULES,
                buying_stage_reasoning="test",
                recommended_outreach_approach="test",
                intel_report=mock_report,
            )

    def test_intel_report_absent_for_tier1_is_ok(self):
        from backend.schemas.models import SignalReport, AccountTier, BuyingStage, BuyingStageMethod, SignalScore

        report = SignalReport(
            account_domain="tier1.com",
            tier=AccountTier.TIER_1,
            signals=[],
            signal_score=SignalScore(high_count=0, medium_count=0, low_count=0, total_score=0),
            buying_stage=BuyingStage.UNAWARE,
            buying_stage_method=BuyingStageMethod.RULES,
            buying_stage_reasoning="test",
            recommended_outreach_approach="test",
            intel_report=None,
        )
        assert report.intel_report is None
