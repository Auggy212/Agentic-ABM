"""
Tests for Phase 2 Pydantic schema models.

Run:  pytest backend/tests/test_phase2_schemas.py -v

Phase 1 tests are in test_schemas.py — this file must not break them.
"""

import uuid
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from backend.schemas.models import (
    AccountTier,
    BuyerIntelMeta,
    BuyerIntelPackage,
    BuyerProfile,
    BuyerSource,
    BuyingStage,
    BuyingStageMethod,
    CommitteeRole,
    EmailStatus,
    EvidenceStatus,
    GeneratedBy,
    InferredPainPoint,
    IntelInferredPainPoint,
    IntelReport,
    IntentLevel,
    RecentNewsItem,
    Seniority,
    SignalIntelligence,
    SignalReport,
    SignalScore,
    SignalSource,
    SignalType,
    StrategicPriority,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def valid_buyer_profile() -> dict:
    return {
        "contact_id": _uuid(),
        "account_domain": "acme.in",
        "full_name": "Priya Sharma",
        "first_name": "Priya",
        "last_name": "Sharma",
        "current_title": "VP of Sales",
        "apollo_title": "VP Sales",
        "title_mismatch_flag": True,
        "seniority": "VP",
        "department": "Sales",
        "email": "priya@acme.in",
        "email_status": "UNVERIFIED",
        "phone": None,
        "linkedin_url": "https://linkedin.com/in/priyasharma",
        "tenure_current_role_months": 14,
        "tenure_current_company_months": 36,
        "past_experience": [
            {
                "company": "PrevCo",
                "title": "Sales Director",
                "start_date": "2020-01",
                "end_date": "2023-03",
            }
        ],
        "recent_activity": [],
        "job_change_signal": False,
        "committee_role": "DECISION_MAKER",
        "committee_role_confidence": 0.85,
        "committee_role_reasoning": "VP-level with budget authority and direct CRM ownership.",
        "inferred_pain_points": [
            {
                "pain_point": "[INFERRED] Struggles with manual pipeline reporting",
                "source": "linkedin_post",
                "confidence": 0.72,
            }
        ],
        "source": "APOLLO",
        "enriched_at": _now(),
    }


@pytest.fixture
def valid_signal_report() -> dict:
    return {
        "account_domain": "acme.in",
        "tier": "TIER_1",
        "signals": [
            {
                "signal_id": _uuid(),
                "type": "FUNDING",
                "intent_level": "HIGH",
                "description": "Raised Series A of $5M",
                "source": "CRUNCHBASE",
                "source_url": "https://crunchbase.com/acme",
                "detected_at": _now(),
                "evidence_snippet": "Acme raised $5M Series A to expand into global markets.",
            }
        ],
        "signal_score": {
            "high_count": 1,
            "medium_count": 0,
            "low_count": 0,
            "total_score": 10,
        },
        "buying_stage": "EVALUATING",
        "buying_stage_method": "RULES",
        "buying_stage_reasoning": "Recent funding + hiring SDR signal triggered EVALUATING classification.",
        "recommended_outreach_approach": "Lead with ROI case study; reference their expansion signal.",
        "intel_report": None,
    }


@pytest.fixture
def valid_intel_report() -> dict:
    return {
        "company_snapshot": "[VERIFIED] Acme is a Bangalore-based SaaS startup. [INFERRED] Likely scaling GTM.",
        "strategic_priorities": [
            {
                "priority": "Global expansion",
                "evidence": "Job postings for SDR roles in US and UK",
                "evidence_status": "VERIFIED",
                "source_url": "https://linkedin.com/jobs/acme",
            }
        ],
        "tech_stack": ["HubSpot", "Segment", "Intercom"],
        "competitive_landscape": [
            {
                "competitor_name": "RivalCo",
                "evidence": "G2 review mentions switching from RivalCo",
                "evidence_status": "VERIFIED",
                "source_url": "https://g2.com/products/rivalco/reviews",
            }
        ],
        "inferred_pain_points": [
            {
                "pain_point": "Manual pipeline visibility",
                "evidence_status": "INFERRED",
                "reasoning": "No RevOps hire found; CRM is basic.",
            }
        ],
        "recent_news": [
            {
                "headline": "Acme raises $5M Series A",
                "date": "2026-03-15",
                "source_url": "https://techcrunch.com/acme-series-a",
                "summary": "Acme announced $5M to accelerate global GTM.",
            }
        ],
        "buying_committee_summary": "3 contacts identified: VP Sales (DM), Marketing Lead (Champion), CTO (Influencer).",
        "recommended_angle": "Reach VP Sales with ROI story tied to their Series A expansion goal.",
        "generated_by": {"researcher": "perplexity", "synthesizer": "claude-sonnet-4"},
        "generated_at": _now(),
    }


# ---------------------------------------------------------------------------
# BuyerProfile — happy path
# ---------------------------------------------------------------------------

class TestBuyerProfileValid:
    def test_valid_profile_passes(self, valid_buyer_profile: dict) -> None:
        profile = BuyerProfile.model_validate(valid_buyer_profile)
        assert profile.full_name == "Priya Sharma"
        assert profile.seniority == Seniority.VP
        assert profile.email_status == EmailStatus.UNVERIFIED
        assert profile.committee_role == CommitteeRole.DECISION_MAKER
        assert profile.source == BuyerSource.APOLLO

    def test_recent_activity_empty_list_is_valid(self, valid_buyer_profile: dict) -> None:
        """Phase 2 reality: Apollo does not expose activity. [] must be accepted."""
        valid_buyer_profile["recent_activity"] = []
        profile = BuyerProfile.model_validate(valid_buyer_profile)
        assert profile.recent_activity == []

    def test_tenure_not_found_is_valid(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["tenure_current_role_months"] = "not_found"
        valid_buyer_profile["tenure_current_company_months"] = "not_found"
        profile = BuyerProfile.model_validate(valid_buyer_profile)
        assert profile.tenure_current_role_months == "not_found"

    def test_email_none_is_valid(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["email"] = None
        profile = BuyerProfile.model_validate(valid_buyer_profile)
        assert profile.email is None

    def test_past_experience_empty_is_valid(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["past_experience"] = []
        profile = BuyerProfile.model_validate(valid_buyer_profile)
        assert profile.past_experience == []

    def test_all_seniority_values_accepted(self, valid_buyer_profile: dict) -> None:
        for level in ["C_SUITE", "VP", "DIRECTOR", "MANAGER", "INDIVIDUAL_CONTRIBUTOR", "UNKNOWN"]:
            valid_buyer_profile["seniority"] = level
            profile = BuyerProfile.model_validate(valid_buyer_profile)
            assert profile.seniority.value == level


# ---------------------------------------------------------------------------
# BuyerProfile — validation failures
# ---------------------------------------------------------------------------

class TestBuyerProfileInvalid:
    def test_committee_role_confidence_above_1_fails(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["committee_role_confidence"] = 1.01
        with pytest.raises(ValidationError) as exc_info:
            BuyerProfile.model_validate(valid_buyer_profile)
        assert any("committee_role_confidence" in str(e["loc"]) for e in exc_info.value.errors())

    def test_committee_role_confidence_below_0_fails(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["committee_role_confidence"] = -0.01
        with pytest.raises(ValidationError) as exc_info:
            BuyerProfile.model_validate(valid_buyer_profile)
        assert any("committee_role_confidence" in str(e["loc"]) for e in exc_info.value.errors())

    def test_committee_role_confidence_at_0_passes(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["committee_role_confidence"] = 0.0
        profile = BuyerProfile.model_validate(valid_buyer_profile)
        assert profile.committee_role_confidence == 0.0

    def test_committee_role_confidence_at_1_passes(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["committee_role_confidence"] = 1.0
        profile = BuyerProfile.model_validate(valid_buyer_profile)
        assert profile.committee_role_confidence == 1.0

    def test_invalid_seniority_fails(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["seniority"] = "PARTNER"
        with pytest.raises(ValidationError):
            BuyerProfile.model_validate(valid_buyer_profile)

    def test_invalid_committee_role_fails(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["committee_role"] = "GATEKEEPER"
        with pytest.raises(ValidationError):
            BuyerProfile.model_validate(valid_buyer_profile)

    def test_invalid_email_status_fails(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["email_status"] = "BOUNCED"
        with pytest.raises(ValidationError):
            BuyerProfile.model_validate(valid_buyer_profile)

    def test_invalid_source_fails(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["source"] = "HARMONIC"
        with pytest.raises(ValidationError):
            BuyerProfile.model_validate(valid_buyer_profile)

    def test_negative_tenure_fails(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["tenure_current_role_months"] = -1
        with pytest.raises(ValidationError):
            BuyerProfile.model_validate(valid_buyer_profile)

    def test_past_experience_max_3_enforced(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["past_experience"] = [
            {"company": f"Co{i}", "title": "Role", "start_date": "2020-01", "end_date": "2021-01"}
            for i in range(4)
        ]
        with pytest.raises(ValidationError):
            BuyerProfile.model_validate(valid_buyer_profile)

    def test_inferred_pain_point_missing_confidence_fails(self, valid_buyer_profile: dict) -> None:
        valid_buyer_profile["inferred_pain_points"] = [
            {"pain_point": "[INFERRED] Something", "source": "linkedin_post"}
            # confidence missing
        ]
        with pytest.raises(ValidationError):
            BuyerProfile.model_validate(valid_buyer_profile)


# ---------------------------------------------------------------------------
# SignalReport — happy path
# ---------------------------------------------------------------------------

class TestSignalReportValid:
    def test_valid_tier1_no_intel_report_passes(self, valid_signal_report: dict) -> None:
        """intel_report=null for TIER_1 is valid — lazy-loaded, not all T1s have one yet."""
        report = SignalReport.model_validate(valid_signal_report)
        assert report.tier == AccountTier.TIER_1
        assert report.intel_report is None

    def test_valid_tier2_no_intel_report_passes(self, valid_signal_report: dict) -> None:
        valid_signal_report["tier"] = "TIER_2"
        report = SignalReport.model_validate(valid_signal_report)
        assert report.tier == AccountTier.TIER_2
        assert report.intel_report is None

    def test_valid_tier3_no_intel_report_passes(self, valid_signal_report: dict) -> None:
        valid_signal_report["tier"] = "TIER_3"
        report = SignalReport.model_validate(valid_signal_report)
        assert report.tier == AccountTier.TIER_3

    def test_valid_tier1_with_intel_report_passes(
        self, valid_signal_report: dict, valid_intel_report: dict
    ) -> None:
        valid_signal_report["tier"] = "TIER_1"
        valid_signal_report["intel_report"] = valid_intel_report
        report = SignalReport.model_validate(valid_signal_report)
        assert report.intel_report is not None
        assert report.intel_report.buying_committee_summary

    def test_all_buying_stages_accepted(self, valid_signal_report: dict) -> None:
        for stage in ["UNAWARE", "PROBLEM_AWARE", "SOLUTION_AWARE", "EVALUATING", "READY_TO_BUY"]:
            valid_signal_report["buying_stage"] = stage
            report = SignalReport.model_validate(valid_signal_report)
            assert report.buying_stage.value == stage

    def test_buying_stage_method_llm_tiebreaker_passes(self, valid_signal_report: dict) -> None:
        valid_signal_report["buying_stage_method"] = "LLM_TIEBREAKER"
        report = SignalReport.model_validate(valid_signal_report)
        assert report.buying_stage_method == BuyingStageMethod.LLM_TIEBREAKER

    def test_all_signal_types_accepted(self, valid_signal_report: dict) -> None:
        signal_base = valid_signal_report["signals"][0]
        for stype in [
            "COMPETITOR_REVIEW", "RELEVANT_HIRE", "FUNDING", "LEADERSHIP_HIRE",
            "EXPANSION", "EXEC_CONTENT", "WEBINAR_ATTENDED", "COMPETITOR_ENGAGEMENT",
            "LEADERSHIP_CHANGE", "ICP_MATCH_NO_SIGNAL", "INDUSTRY_EVENT", "COMPETITOR_FOLLOW",
        ]:
            valid_signal_report["signals"] = [{**signal_base, "signal_id": _uuid(), "type": stype}]
            report = SignalReport.model_validate(valid_signal_report)
            assert report.signals[0].type.value == stype


# ---------------------------------------------------------------------------
# SignalReport — validation failures
# ---------------------------------------------------------------------------

class TestSignalReportInvalid:
    def test_intel_report_present_on_tier2_fails(
        self, valid_signal_report: dict, valid_intel_report: dict
    ) -> None:
        """TIER_2 accounts must never have an intel_report — it's TIER_1 only."""
        valid_signal_report["tier"] = "TIER_2"
        valid_signal_report["intel_report"] = valid_intel_report
        with pytest.raises(ValidationError) as exc_info:
            SignalReport.model_validate(valid_signal_report)
        errors = str(exc_info.value)
        assert "intel_report" in errors or "TIER_2" in errors or "TIER_1" in errors

    def test_intel_report_present_on_tier3_fails(
        self, valid_signal_report: dict, valid_intel_report: dict
    ) -> None:
        valid_signal_report["tier"] = "TIER_3"
        valid_signal_report["intel_report"] = valid_intel_report
        with pytest.raises(ValidationError):
            SignalReport.model_validate(valid_signal_report)

    def test_invalid_intent_level_fails(self, valid_signal_report: dict) -> None:
        valid_signal_report["signals"][0]["intent_level"] = "CRITICAL"
        with pytest.raises(ValidationError) as exc_info:
            SignalReport.model_validate(valid_signal_report)
        assert any("intent_level" in str(e["loc"]) for e in exc_info.value.errors())

    def test_invalid_signal_type_fails(self, valid_signal_report: dict) -> None:
        valid_signal_report["signals"][0]["type"] = "PRICE_DROP"
        with pytest.raises(ValidationError):
            SignalReport.model_validate(valid_signal_report)

    def test_invalid_signal_source_fails(self, valid_signal_report: dict) -> None:
        valid_signal_report["signals"][0]["source"] = "TWITTER"
        with pytest.raises(ValidationError):
            SignalReport.model_validate(valid_signal_report)

    def test_evidence_snippet_too_long_fails(self, valid_signal_report: dict) -> None:
        valid_signal_report["signals"][0]["evidence_snippet"] = "x" * 501
        with pytest.raises(ValidationError):
            SignalReport.model_validate(valid_signal_report)

    def test_evidence_snippet_at_500_passes(self, valid_signal_report: dict) -> None:
        valid_signal_report["signals"][0]["evidence_snippet"] = "x" * 500
        report = SignalReport.model_validate(valid_signal_report)
        assert len(report.signals[0].evidence_snippet) == 500

    def test_invalid_buying_stage_fails(self, valid_signal_report: dict) -> None:
        valid_signal_report["buying_stage"] = "CONSIDERING"
        with pytest.raises(ValidationError):
            SignalReport.model_validate(valid_signal_report)


# ---------------------------------------------------------------------------
# IntelReport — pain points must have evidence_status
# ---------------------------------------------------------------------------

class TestIntelReportInferredPainPoints:
    def test_inferred_pain_point_without_evidence_status_fails(
        self, valid_signal_report: dict, valid_intel_report: dict
    ) -> None:
        """Each inferred_pain_points entry must carry evidence_status."""
        valid_intel_report["inferred_pain_points"] = [
            {
                "pain_point": "Manual reporting",
                # evidence_status missing
                "reasoning": "No RevOps hire found",
            }
        ]
        valid_signal_report["tier"] = "TIER_1"
        valid_signal_report["intel_report"] = valid_intel_report
        with pytest.raises(ValidationError):
            SignalReport.model_validate(valid_signal_report)

    def test_inferred_pain_point_with_verified_status_fails(
        self, valid_signal_report: dict, valid_intel_report: dict
    ) -> None:
        """IntelReport pain points must always be INFERRED — never VERIFIED."""
        valid_intel_report["inferred_pain_points"] = [
            {
                "pain_point": "Manual reporting",
                "evidence_status": "VERIFIED",
                "reasoning": "Stated in press release",
            }
        ]
        valid_signal_report["tier"] = "TIER_1"
        valid_signal_report["intel_report"] = valid_intel_report
        with pytest.raises(ValidationError):
            SignalReport.model_validate(valid_signal_report)

    def test_inferred_pain_point_with_inferred_status_passes(
        self, valid_signal_report: dict, valid_intel_report: dict
    ) -> None:
        valid_intel_report["inferred_pain_points"] = [
            {
                "pain_point": "Manual reporting",
                "evidence_status": "INFERRED",
                "reasoning": "No RevOps hire found",
            }
        ]
        valid_signal_report["tier"] = "TIER_1"
        valid_signal_report["intel_report"] = valid_intel_report
        report = SignalReport.model_validate(valid_signal_report)
        assert report.intel_report.inferred_pain_points[0].evidence_status == EvidenceStatus.INFERRED


# ---------------------------------------------------------------------------
# IntelReport — recent_news max 3
# ---------------------------------------------------------------------------

class TestIntelReportRecentNews:
    def _news_item(self) -> dict:
        return {
            "headline": "Test headline",
            "date": "2026-04-01",
            "source_url": "https://techcrunch.com/test",
            "summary": "A summary",
        }

    def test_recent_news_max_3_enforced(
        self, valid_signal_report: dict, valid_intel_report: dict
    ) -> None:
        valid_intel_report["recent_news"] = [self._news_item() for _ in range(4)]
        valid_signal_report["tier"] = "TIER_1"
        valid_signal_report["intel_report"] = valid_intel_report
        with pytest.raises(ValidationError):
            SignalReport.model_validate(valid_signal_report)

    def test_recent_news_3_items_passes(
        self, valid_signal_report: dict, valid_intel_report: dict
    ) -> None:
        valid_intel_report["recent_news"] = [self._news_item() for _ in range(3)]
        valid_signal_report["tier"] = "TIER_1"
        valid_signal_report["intel_report"] = valid_intel_report
        report = SignalReport.model_validate(valid_signal_report)
        assert len(report.intel_report.recent_news) == 3


# ---------------------------------------------------------------------------
# BuyerIntelPackage — max 5 contacts per account
# ---------------------------------------------------------------------------

class TestBuyerIntelPackage:
    def _meta(self) -> dict:
        return {
            "total_accounts_processed": 1,
            "total_contacts_found": 2,
            "contacts_per_account_avg": 2.0,
            "hunter_quota_used": 10,
            "apollo_quota_used": 50,
            "mismatches_flagged": 1,
        }

    def test_valid_package_passes(self, valid_buyer_profile: dict) -> None:
        pkg = BuyerIntelPackage.model_validate(
            {
                "client_id": _uuid(),
                "generated_at": _now(),
                "accounts": {"acme.in": [valid_buyer_profile]},
                "meta": self._meta(),
            }
        )
        assert "acme.in" in pkg.accounts

    def test_more_than_5_contacts_per_account_fails(self, valid_buyer_profile: dict) -> None:
        pkg_dict = {
            "client_id": _uuid(),
            "generated_at": _now(),
            "accounts": {
                "acme.in": [
                    {**valid_buyer_profile, "contact_id": _uuid()}
                    for _ in range(6)
                ]
            },
            "meta": self._meta(),
        }
        with pytest.raises(ValidationError):
            BuyerIntelPackage.model_validate(pkg_dict)

    def test_exactly_5_contacts_passes(self, valid_buyer_profile: dict) -> None:
        pkg = BuyerIntelPackage.model_validate(
            {
                "client_id": _uuid(),
                "generated_at": _now(),
                "accounts": {
                    "acme.in": [
                        {**valid_buyer_profile, "contact_id": _uuid()}
                        for _ in range(5)
                    ]
                },
                "meta": self._meta(),
            }
        )
        assert len(pkg.accounts["acme.in"]) == 5


# ---------------------------------------------------------------------------
# SignalIntelligence — top-level map
# ---------------------------------------------------------------------------

class TestSignalIntelligence:
    def test_valid_signal_intelligence_passes(self, valid_signal_report: dict) -> None:
        si = SignalIntelligence.model_validate({"acme.in": valid_signal_report})
        assert "acme.in" in si.root

    def test_multiple_domains_pass(self, valid_signal_report: dict) -> None:
        si = SignalIntelligence.model_validate(
            {
                "acme.in": valid_signal_report,
                "beta.io": {**valid_signal_report, "account_domain": "beta.io", "tier": "TIER_2"},
            }
        )
        assert len(si.root) == 2

    def test_invalid_entry_fails(self, valid_signal_report: dict) -> None:
        valid_signal_report["tier"] = "NOT_A_TIER"
        with pytest.raises(ValidationError):
            SignalIntelligence.model_validate({"acme.in": valid_signal_report})
