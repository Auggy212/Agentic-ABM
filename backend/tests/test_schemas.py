"""
Tests for Pydantic v2 schema models (Phase 1 — schemas layer).

Run:  pytest backend/tests/test_schemas.py -v
"""

import pytest
from pydantic import ValidationError

from backend.schemas.models import (
    AccountTier,
    ICPAccount,
    ICPAccountList,
    MasterContext,
)


# ---------------------------------------------------------------------------
# Fixtures — minimal valid payloads
# ---------------------------------------------------------------------------

@pytest.fixture
def valid_master_context() -> dict:
    return {
        "company": {
            "name": "Acme AI",
            "website": "https://acme.ai",
            "industry": "SaaS",
            "stage": "Series A",
            "product": "AI-powered ABM platform",
            "value_prop": "10x pipeline from existing TAM",
            "differentiators": ["real-time signals", "AI scoring"],
            "pricing_model": "Subscription",
            "acv_range": "$20k–$80k",
            "reference_customers": ["Company A", "Company B"],
        },
        "icp": {
            "industries": ["SaaS", "Fintech"],
            "company_size_employees": "50-500",
            "company_size_arr": "$1M-$20M",
            "funding_stage": ["Series A", "Series B"],
            "geographies": ["USA", "Canada"],
            "tech_stack_signals": ["HubSpot", "Salesforce"],
            "buying_triggers": ["new funding", "headcount growth"],
            "negative_icp": [],
        },
        "buyers": {
            "titles": ["VP Sales", "CRO"],
            "seniority": ["VP", "C-Suite"],
            "buying_committee_size": "3-5",
            "pain_points": ["poor data quality", "manual prospecting"],
            "unstated_needs": ["time savings", "pipeline visibility"],
        },
        "competitors": [
            {"name": "6sense", "weaknesses": ["expensive", "complex setup"]}
        ],
        "gtm": {
            "win_themes": ["ROI in 90 days", "easy onboarding"],
            "loss_themes": ["budget constraints"],
            "channels": ["LinkedIn", "Email"],
            "crm": "HubSpot",
            "existing_account_list": None,
        },
        "meta": {
            "created_at": "2026-04-24T10:00:00Z",
            "client_id": "12345678-1234-5678-1234-567812345678",
            "version": "1.0.0",
        },
    }


@pytest.fixture
def valid_icp_account() -> dict:
    return {
        "domain": "target.io",
        "company_name": "Target Co",
        "website": "https://target.io",
        "linkedin_url": None,
        "industry": "Fintech",
        "headcount": 200,
        "estimated_arr": "$5M-$15M",
        "funding_stage": "Series B",
        "last_funding_round": {
            "round": "Series B",
            "amount_usd": 20_000_000,
            "date": "2025-06-15",
        },
        "hq_location": "San Francisco, CA",
        "technologies_used": ["Salesforce", "Snowflake"],
        "recent_signals": [
            {
                "type": "JOB_POSTING",
                "description": "Hiring VP of Sales",
                "date": "2026-03-10",
                "source_url": "https://linkedin.com/jobs/123",
            }
        ],
        "icp_score": 82,
        "score_breakdown": {
            "industry": 20,
            "company_size": 20,
            "geography": 15,
            "tech_stack": 15,
            "funding_stage": 7,
            "buying_triggers": 5,
        },
        "tier": "TIER_1",
        "source": "APOLLO",
        "enriched_at": "2026-04-24T08:30:00Z",
    }


@pytest.fixture
def valid_icp_account_list(valid_icp_account: dict) -> dict:
    return {
        "accounts": [valid_icp_account],
        "meta": {
            "total_found": 1,
            "tier_breakdown": {"tier_1": 1, "tier_2": 0, "tier_3": 0},
            "generated_at": "2026-04-24T09:00:00Z",
            "client_id": "12345678-1234-5678-1234-567812345678",
        },
    }


# ---------------------------------------------------------------------------
# Happy-path tests — valid fixtures must pass without errors
# ---------------------------------------------------------------------------

class TestValidFixtures:
    def test_master_context_valid(self, valid_master_context: dict) -> None:
        ctx = MasterContext.model_validate(valid_master_context)
        assert ctx.company.name == "Acme AI"
        assert ctx.icp.negative_icp == []   # empty list is intentionally valid

    def test_icp_account_valid(self, valid_icp_account: dict) -> None:
        account = ICPAccount.model_validate(valid_icp_account)
        assert account.icp_score == 82
        assert account.tier == AccountTier.TIER_1

    def test_icp_account_list_valid(self, valid_icp_account_list: dict) -> None:
        lst = ICPAccountList.model_validate(valid_icp_account_list)
        assert lst.meta.total_found == 1
        assert lst.meta.tier_breakdown.tier_1 == 1

    def test_master_context_negative_icp_with_values(
        self, valid_master_context: dict
    ) -> None:
        valid_master_context["icp"]["negative_icp"] = ["BigCorp", "GovOnly Inc"]
        ctx = MasterContext.model_validate(valid_master_context)
        assert len(ctx.icp.negative_icp) == 2

    def test_not_found_headcount(self, valid_icp_account: dict) -> None:
        valid_icp_account["headcount"] = "not_found"
        account = ICPAccount.model_validate(valid_icp_account)
        assert account.headcount == "not_found"

    def test_not_found_funding_round(self, valid_icp_account: dict) -> None:
        valid_icp_account["last_funding_round"]["amount_usd"] = "not_found"
        valid_icp_account["last_funding_round"]["date"] = "not_found"
        account = ICPAccount.model_validate(valid_icp_account)
        assert account.last_funding_round.amount_usd == "not_found"


# ---------------------------------------------------------------------------
# Critical: negative_icp = None must fail
# ---------------------------------------------------------------------------

class TestNegativeIcpNullRejected:
    """
    negative_icp = None must be a hard validation error.
    A None here would silently skip exclusion filtering in downstream agents,
    allowing competitors and blacklisted accounts into the pipeline.
    """

    def test_negative_icp_none_fails(self, valid_master_context: dict) -> None:
        valid_master_context["icp"]["negative_icp"] = None
        with pytest.raises(ValidationError) as exc_info:
            MasterContext.model_validate(valid_master_context)
        errors = exc_info.value.errors()
        locs = [str(e["loc"]) for e in errors]
        assert any("negative_icp" in loc for loc in locs), (
            f"Expected a negative_icp error, got: {errors}"
        )

    def test_negative_icp_missing_fails(self, valid_master_context: dict) -> None:
        del valid_master_context["icp"]["negative_icp"]
        with pytest.raises(ValidationError) as exc_info:
            MasterContext.model_validate(valid_master_context)
        errors = exc_info.value.errors()
        locs = [str(e["loc"]) for e in errors]
        assert any("negative_icp" in loc for loc in locs)

    def test_empty_array_is_valid_and_distinct_from_none(
        self, valid_master_context: dict
    ) -> None:
        """[] must pass; None must fail. They must not be treated identically."""
        valid_master_context["icp"]["negative_icp"] = []
        ctx = MasterContext.model_validate(valid_master_context)
        assert ctx.icp.negative_icp == []

        valid_master_context["icp"]["negative_icp"] = None
        with pytest.raises(ValidationError):
            MasterContext.model_validate(valid_master_context)


# ---------------------------------------------------------------------------
# icp_score outside 0–100 must fail
# ---------------------------------------------------------------------------

class TestIcpScoreBounds:
    def test_score_above_100_fails(self, valid_icp_account: dict) -> None:
        valid_icp_account["icp_score"] = 101
        valid_icp_account["tier"] = "TIER_1"
        with pytest.raises(ValidationError) as exc_info:
            ICPAccount.model_validate(valid_icp_account)
        assert any("icp_score" in str(e["loc"]) for e in exc_info.value.errors())

    def test_score_below_0_fails(self, valid_icp_account: dict) -> None:
        valid_icp_account["icp_score"] = -1
        valid_icp_account["tier"] = "TIER_3"
        with pytest.raises(ValidationError) as exc_info:
            ICPAccount.model_validate(valid_icp_account)
        assert any("icp_score" in str(e["loc"]) for e in exc_info.value.errors())

    def test_score_boundary_0_passes(self, valid_icp_account: dict) -> None:
        valid_icp_account["icp_score"] = 0
        valid_icp_account["tier"] = "TIER_3"
        account = ICPAccount.model_validate(valid_icp_account)
        assert account.icp_score == 0

    def test_score_boundary_100_passes(self, valid_icp_account: dict) -> None:
        valid_icp_account["icp_score"] = 100
        valid_icp_account["tier"] = "TIER_1"
        account = ICPAccount.model_validate(valid_icp_account)
        assert account.icp_score == 100


# ---------------------------------------------------------------------------
# Tier inconsistency with score must fail
# ---------------------------------------------------------------------------

class TestTierConsistency:
    """
    Tier must match icp_score:
      TIER_1 → 80–100
      TIER_2 → 60–79
      TIER_3 → 0–59
    """

    def test_tier1_with_score_60_fails(self, valid_icp_account: dict) -> None:
        valid_icp_account["icp_score"] = 60
        valid_icp_account["tier"] = "TIER_1"
        with pytest.raises(ValidationError) as exc_info:
            ICPAccount.model_validate(valid_icp_account)
        errors = exc_info.value.errors()
        assert any("TIER_1" in str(e) or "tier" in str(e["loc"]) for e in errors), (
            f"Expected tier mismatch error, got: {errors}"
        )

    def test_tier3_with_score_80_fails(self, valid_icp_account: dict) -> None:
        valid_icp_account["icp_score"] = 80
        valid_icp_account["tier"] = "TIER_3"
        with pytest.raises(ValidationError):
            ICPAccount.model_validate(valid_icp_account)

    def test_tier2_with_score_79_passes(self, valid_icp_account: dict) -> None:
        valid_icp_account["icp_score"] = 79
        valid_icp_account["tier"] = "TIER_2"
        account = ICPAccount.model_validate(valid_icp_account)
        assert account.tier == AccountTier.TIER_2

    def test_tier2_with_score_80_fails(self, valid_icp_account: dict) -> None:
        """Score 80 is TIER_1 boundary — TIER_2 must be rejected."""
        valid_icp_account["icp_score"] = 80
        valid_icp_account["tier"] = "TIER_2"
        with pytest.raises(ValidationError):
            ICPAccount.model_validate(valid_icp_account)

    def test_tier3_with_score_59_passes(self, valid_icp_account: dict) -> None:
        valid_icp_account["icp_score"] = 59
        valid_icp_account["tier"] = "TIER_3"
        account = ICPAccount.model_validate(valid_icp_account)
        assert account.tier == AccountTier.TIER_3

    def test_tier2_with_score_60_passes(self, valid_icp_account: dict) -> None:
        valid_icp_account["icp_score"] = 60
        valid_icp_account["tier"] = "TIER_2"
        account = ICPAccount.model_validate(valid_icp_account)
        assert account.tier == AccountTier.TIER_2


# ---------------------------------------------------------------------------
# Misc field validation
# ---------------------------------------------------------------------------

class TestMiscValidation:
    def test_industries_max_5(self, valid_master_context: dict) -> None:
        valid_master_context["icp"]["industries"] = ["A", "B", "C", "D", "E", "F"]
        with pytest.raises(ValidationError):
            MasterContext.model_validate(valid_master_context)

    def test_industries_exactly_5_passes(self, valid_master_context: dict) -> None:
        valid_master_context["icp"]["industries"] = ["A", "B", "C", "D", "E"]
        ctx = MasterContext.model_validate(valid_master_context)
        assert len(ctx.icp.industries) == 5

    def test_invalid_stage_enum_fails(self, valid_master_context: dict) -> None:
        valid_master_context["company"]["stage"] = "Pre-Seed"
        with pytest.raises(ValidationError):
            MasterContext.model_validate(valid_master_context)

    def test_invalid_channel_enum_fails(self, valid_master_context: dict) -> None:
        valid_master_context["gtm"]["channels"] = ["TikTok"]
        with pytest.raises(ValidationError):
            MasterContext.model_validate(valid_master_context)

    def test_invalid_version_semver_fails(self, valid_master_context: dict) -> None:
        valid_master_context["meta"]["version"] = "v1.0"
        with pytest.raises(ValidationError):
            MasterContext.model_validate(valid_master_context)

    def test_version_semver_passes(self, valid_master_context: dict) -> None:
        valid_master_context["meta"]["version"] = "2.3.11"
        ctx = MasterContext.model_validate(valid_master_context)
        assert ctx.meta.version == "2.3.11"

    def test_invalid_source_enum_fails(self, valid_icp_account: dict) -> None:
        valid_icp_account["source"] = "LINKEDIN"
        with pytest.raises(ValidationError):
            ICPAccount.model_validate(valid_icp_account)

    def test_negative_headcount_fails(self, valid_icp_account: dict) -> None:
        valid_icp_account["headcount"] = -1
        with pytest.raises(ValidationError):
            ICPAccount.model_validate(valid_icp_account)
