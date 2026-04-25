"""
Tests for the ICP Scout scoring engine (Phase 1).

Run:  pytest backend/tests/test_scoring.py -v

All tests are self-contained — no external services required.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List

import pytest

from backend.agents.icp_scout.scoring import (
    WEIGHTS,
    RawCompany,
    RawFundingRound,
    RawSignal,
    ScoredAccount,
    filter_negative_icp,
    score_account,
)
from backend.agents.icp_scout import scoring_rules as rules
from backend.schemas.models import AccountTier, DataSource, MasterContext


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_TODAY = date(2026, 4, 25)  # fixed reference date for all trigger tests


def _signal(
    sig_type: str,
    description: str,
    days_ago: int = 10,
    source_url: str = "https://example.com",
) -> RawSignal:
    return RawSignal(**{
        "type": sig_type,
        "description": description,
        "date": (_TODAY - timedelta(days=days_ago)).isoformat(),
        "source_url": source_url,
    })


def _round(
    round_label: str = "Series B",
    amount: int = 20_000_000,
    close_date: str = "2025-06-15",
) -> RawFundingRound:
    return RawFundingRound(round=round_label, amount_usd=amount, date=close_date)


def _master_context(**overrides) -> MasterContext:
    """Build a valid MasterContext, allowing per-field overrides for icp.*."""
    icp_defaults = {
        "industries": ["Revenue Intelligence SaaS", "Fintech"],
        "company_size_employees": "100-500",
        "company_size_arr": "$5M-$50M",
        "funding_stage": ["Series A", "Series B"],
        "geographies": ["USA", "Canada"],
        "tech_stack_signals": ["HubSpot", "Salesforce", "Snowflake"],
        "buying_triggers": ["new VP sales hire", "series b funding", "headcount growth"],
        "negative_icp": [],
    }
    icp_defaults.update(overrides.pop("icp", {}))

    return MasterContext.model_validate({
        "company": {
            "name": "Acme AI",
            "website": "https://acme.ai",
            "industry": "Revenue Intelligence SaaS",
            "stage": "Series A",
            "product": "AI ABM platform",
            "value_prop": (
                "We help Series B SaaS companies cut manual prospecting by 80% "
                "using real-time buyer-intent signals and AI-driven account scoring."
            ),
            "differentiators": ["real-time signals", "native HubSpot sync"],
            "pricing_model": "Subscription",
            "acv_range": "$20k-$80k",
            "reference_customers": ["Gong", "Outreach"],
        },
        "icp": icp_defaults,
        "buyers": {
            "titles": ["VP Sales", "CRO"],
            "seniority": ["VP", "C-Suite"],
            "buying_committee_size": "3-5",
            "pain_points": ["manual prospecting wastes 10 hours per week per rep"],
            "unstated_needs": ["pipeline predictability"],
        },
        "competitors": [{"name": "6sense", "weaknesses": ["expensive"]}],
        "gtm": {
            "win_themes": ["ROI in 90 days"],
            "loss_themes": ["budget"],
            "channels": ["LinkedIn", "Email"],
            "crm": "HubSpot",
            "existing_account_list": None,
        },
        "meta": {
            "created_at": "2026-04-25T10:00:00Z",
            "client_id": "12345678-1234-5678-1234-567812345678",
            "version": "1.0.0",
        },
    })


def _perfect_account() -> RawCompany:
    """Account that should match every dimension perfectly."""
    return RawCompany(
        domain="perfect.io",
        company_name="Perfect Fit Co",
        website="https://perfect.io",
        linkedin_url=None,
        industry="Revenue Intelligence SaaS",   # exact ICP industry match
        headcount=250,                           # within 100-500
        estimated_arr="$10M-$30M",
        funding_stage="Series B",               # in ICP list
        last_funding_round=_round(),
        hq_location="San Francisco, CA",        # USA → in geographies
        technologies_used=["HubSpot", "Salesforce", "Snowflake"],  # all 3 signals
        recent_signals=[
            _signal("JOB_POSTING", "Hiring new VP Sales", days_ago=5),
        ],
        source=DataSource.APOLLO,
        enriched_at=datetime.now(tz=timezone.utc),
    )


def _zero_account() -> RawCompany:
    """Account that matches nothing."""
    return RawCompany(
        domain="nomatch.io",
        company_name="No Match Ltd",
        website="https://nomatch.io",
        linkedin_url=None,
        industry="Biopharma Manufacturing",     # no ICP match
        headcount=50000,                        # way outside 100-500, >20% tolerance
        estimated_arr="$5B+",
        funding_stage="Public",                 # no ICP match, non-adjacent
        last_funding_round=_round("IPO", 0, "2010-01-01"),
        hq_location="Tokyo, Japan",             # not in geographies
        technologies_used=["Oracle", "SAP"],   # no ICP signals
        recent_signals=[],                      # no triggers
        source=DataSource.HARMONIC,
        enriched_at=datetime.now(tz=timezone.utc),
    )


# ---------------------------------------------------------------------------
# Weight sum regression guard
# ---------------------------------------------------------------------------

class TestWeightSum:
    def test_weights_sum_to_100(self) -> None:
        assert sum(WEIGHTS.values()) == 100, (
            f"Weights must sum to 100, got {sum(WEIGHTS.values())}. "
            f"Current weights: {WEIGHTS}"
        )

    def test_all_six_dimensions_present(self) -> None:
        expected = {"industry", "company_size", "geography", "tech_stack",
                    "funding_stage", "buying_triggers"}
        assert set(WEIGHTS.keys()) == expected


# ---------------------------------------------------------------------------
# Perfect fit and zero fit
# ---------------------------------------------------------------------------

class TestPerfectAndZeroFit:
    def test_perfect_account_scores_100_and_is_tier1(self) -> None:
        ctx = _master_context()
        result = score_account(_perfect_account(), ctx, reference_date=_TODAY)
        assert result.icp_score == 100
        assert result.tier == AccountTier.TIER_1

    def test_perfect_account_breakdown_sums_to_score(self) -> None:
        ctx = _master_context()
        result = score_account(_perfect_account(), ctx, reference_date=_TODAY)
        bd = result.score_breakdown
        assert sum(bd.values()) == result.icp_score

    def test_zero_account_scores_at_most_10_and_is_tier3(self) -> None:
        ctx = _master_context()
        result = score_account(_zero_account(), ctx, reference_date=_TODAY)
        # only partial credit from missing-headcount rule (30% of 20 = 6)
        assert result.icp_score <= 10
        assert result.tier == AccountTier.TIER_3

    def test_zero_account_all_breakdown_keys_present(self) -> None:
        ctx = _master_context()
        result = score_account(_zero_account(), ctx, reference_date=_TODAY)
        assert set(result.score_breakdown.keys()) == {
            "industry", "company_size", "geography",
            "tech_stack", "funding_stage", "buying_triggers",
        }


# ---------------------------------------------------------------------------
# Industry dimension
# ---------------------------------------------------------------------------

class TestIndustryRule:
    @pytest.mark.parametrize("industry,icp_industries,expected_frac", [
        # Exact match
        ("Revenue Intelligence SaaS", ["Revenue Intelligence SaaS", "Fintech"], 1.0),
        # Case-insensitive exact
        ("revenue intelligence saas", ["Revenue Intelligence SaaS"], 1.0),
        # Parent-child match: Fintech is child of Financial Services
        ("Fintech", ["Financial Services"], 0.6),
        # Parent-child the other direction
        ("Financial Services", ["Fintech"], 0.6),
        # SaaS → Technology parent category
        ("SaaS", ["Technology"], 0.6),
        # No match
        ("Biopharma", ["Revenue Intelligence SaaS", "Fintech"], 0.0),
        # Single entry no match
        ("Hardware", ["SaaS"], 0.0),
    ])
    def test_score_industry_parametrized(self, industry, icp_industries, expected_frac) -> None:
        assert rules.score_industry(industry, icp_industries) == expected_frac

    def test_industry_contributes_correct_points(self) -> None:
        ctx = _master_context()
        account = _perfect_account()
        result = score_account(account, ctx, reference_date=_TODAY)
        assert result.score_breakdown["industry"] == WEIGHTS["industry"]  # 25


# ---------------------------------------------------------------------------
# Company size dimension
# ---------------------------------------------------------------------------

class TestCompanySizeRule:
    @pytest.mark.parametrize("headcount,icp_range,expected_frac", [
        # Within range
        (250, "100-500", 1.0),
        (100, "100-500", 1.0),   # lower bound
        (500, "100-500", 1.0),   # upper bound
        # Within 20% below lower: 100 * 0.8 = 80, so 85 should be near
        (85, "100-500", 0.5),
        # Within 20% above upper: 500 + 500*0.2 = 600, so 550 → near
        (560, "100-500", 0.5),
        # Outside tolerance
        (10, "100-500", 0.0),
        (10000, "100-500", 0.0),
        # not_found → partial credit
        ("not_found", "100-500", 0.3),
        # Comma-formatted range
        (1500, "1,000-5,000", 1.0),
    ])
    def test_score_company_size_parametrized(self, headcount, icp_range, expected_frac) -> None:
        assert rules.score_company_size(headcount, icp_range) == expected_frac

    def test_missing_headcount_gets_30_percent_partial_credit(self) -> None:
        ctx = _master_context()
        account = _perfect_account()
        account = RawCompany(**{**account.model_dump(), "headcount": "not_found"})
        result = score_account(account, ctx, reference_date=_TODAY)
        expected_pts = int(0.3 * WEIGHTS["company_size"])  # 6 points
        assert result.score_breakdown["company_size"] == expected_pts

    def test_within_range_full_points(self) -> None:
        ctx = _master_context()
        result = score_account(_perfect_account(), ctx, reference_date=_TODAY)
        assert result.score_breakdown["company_size"] == WEIGHTS["company_size"]  # 20


# ---------------------------------------------------------------------------
# Geography dimension
# ---------------------------------------------------------------------------

class TestGeographyRule:
    @pytest.mark.parametrize("hq,geographies,expected_frac", [
        # Exact country-level match
        ("USA", ["USA", "Canada"], 1.0),
        # City in US → matches USA geography
        ("San Francisco, CA", ["USA"], 1.0),
        # City in US → matches 'United States' geography
        ("New York, NY", ["United States"], 1.0),
        # Exact city match
        ("Toronto, Canada", ["Canada"], 1.0),
        # Different city, same country via UK alias
        ("Manchester, UK", ["London, UK"], 0.5),
        # Different country
        ("Tokyo, Japan", ["USA", "Canada"], 0.0),
        # Country code shorthand
        ("Berlin, Germany", ["USA"], 0.0),
    ])
    def test_score_geography_parametrized(self, hq, geographies, expected_frac) -> None:
        result = rules.score_geography(hq, geographies)
        assert result == expected_frac, (
            f"score_geography({hq!r}, {geographies!r}) = {result}, expected {expected_frac}"
        )

    def test_hq_in_icp_geographies_full_points(self) -> None:
        ctx = _master_context()
        result = score_account(_perfect_account(), ctx, reference_date=_TODAY)
        assert result.score_breakdown["geography"] == WEIGHTS["geography"]  # 15

    def test_different_country_zero_points(self) -> None:
        ctx = _master_context()
        account = RawCompany(**{**_perfect_account().model_dump(), "hq_location": "Tokyo, Japan"})
        result = score_account(account, ctx, reference_date=_TODAY)
        assert result.score_breakdown["geography"] == 0


# ---------------------------------------------------------------------------
# Tech stack dimension
# ---------------------------------------------------------------------------

class TestTechStackRule:
    @pytest.mark.parametrize("account_tech,icp_signals,expected_frac", [
        # All match
        (["HubSpot", "Salesforce", "Snowflake"], ["HubSpot", "Salesforce", "Snowflake"], 1.0),
        # 2 of 3
        (["HubSpot", "Salesforce"], ["HubSpot", "Salesforce", "Snowflake"], 2 / 3),
        # 1 of 3
        (["HubSpot"], ["HubSpot", "Salesforce", "Snowflake"], 1 / 3),
        # None match
        (["Oracle", "SAP"], ["HubSpot", "Salesforce"], 0.0),
        # Case-insensitive
        (["hubspot", "SALESFORCE"], ["HubSpot", "Salesforce"], 1.0),
        # No ICP signals defined → 0
        (["HubSpot"], [], 0.0),
        # Empty account tech
        ([], ["HubSpot"], 0.0),
    ])
    def test_score_tech_stack_parametrized(self, account_tech, icp_signals, expected_frac) -> None:
        result = rules.score_tech_stack(account_tech, icp_signals)
        assert abs(result - expected_frac) < 0.001, (
            f"score_tech_stack({account_tech}, {icp_signals}) = {result}, expected {expected_frac}"
        )

    def test_all_signals_present_full_points(self) -> None:
        ctx = _master_context()
        result = score_account(_perfect_account(), ctx, reference_date=_TODAY)
        assert result.score_breakdown["tech_stack"] == WEIGHTS["tech_stack"]  # 20

    def test_partial_match_proportional_points(self) -> None:
        ctx = _master_context()  # 3 ICP tech signals
        account = RawCompany(**{
            **_perfect_account().model_dump(),
            "technologies_used": ["HubSpot"],  # 1 of 3
        })
        result = score_account(account, ctx, reference_date=_TODAY)
        expected = int((1 / 3) * WEIGHTS["tech_stack"])
        assert result.score_breakdown["tech_stack"] == expected


# ---------------------------------------------------------------------------
# Funding stage dimension
# ---------------------------------------------------------------------------

class TestFundingStageRule:
    @pytest.mark.parametrize("account_stage,icp_stages,expected_frac", [
        # Exact
        ("Series B", ["Series A", "Series B"], 1.0),
        ("Series A", ["Series A"], 1.0),
        # Case-insensitive
        ("series b", ["Series B"], 1.0),
        # Adjacent: Series A ↔ Series B (distance 1)
        ("Series C", ["Series B"], 0.5),
        ("Seed", ["Series A"], 0.5),
        # Non-adjacent
        ("Seed", ["Series C"], 0.0),
        ("Public", ["Series A"], 0.0),
        # Growth adjacent to Series D
        ("Series D", ["Growth"], 0.5),
        # No match
        ("Pre-Seed", ["Series B", "Series C"], 0.0),
    ])
    def test_score_funding_stage_parametrized(self, account_stage, icp_stages, expected_frac) -> None:
        result = rules.score_funding_stage(account_stage, icp_stages)
        assert result == expected_frac, (
            f"score_funding_stage({account_stage!r}, {icp_stages!r}) = {result}, expected {expected_frac}"
        )

    def test_exact_match_full_points(self) -> None:
        ctx = _master_context()
        result = score_account(_perfect_account(), ctx, reference_date=_TODAY)
        assert result.score_breakdown["funding_stage"] == WEIGHTS["funding_stage"]  # 10

    def test_adjacent_stage_half_points(self) -> None:
        ctx = _master_context()  # ICP wants Series A, Series B
        account = RawCompany(**{**_perfect_account().model_dump(), "funding_stage": "Series C"})
        result = score_account(account, ctx, reference_date=_TODAY)
        expected = int(0.5 * WEIGHTS["funding_stage"])  # 5
        assert result.score_breakdown["funding_stage"] == expected


# ---------------------------------------------------------------------------
# Buying trigger dimension
# ---------------------------------------------------------------------------

class TestBuyingTriggerRule:
    def test_matching_signal_within_90_days_full_points(self) -> None:
        ctx = _master_context()
        result = score_account(_perfect_account(), ctx, reference_date=_TODAY)
        assert result.score_breakdown["buying_triggers"] == WEIGHTS["buying_triggers"]  # 10

    def test_signal_older_than_90_days_zero_points(self) -> None:
        ctx = _master_context()
        account = RawCompany(**{
            **_perfect_account().model_dump(),
            "recent_signals": [_signal("JOB_POSTING", "Hiring new VP Sales", days_ago=91)],
        })
        result = score_account(account, ctx, reference_date=_TODAY)
        assert result.score_breakdown["buying_triggers"] == 0

    def test_no_signals_zero_points(self) -> None:
        ctx = _master_context()
        account = RawCompany(**{**_perfect_account().model_dump(), "recent_signals": []})
        result = score_account(account, ctx, reference_date=_TODAY)
        assert result.score_breakdown["buying_triggers"] == 0

    def test_signal_matches_by_description_keyword(self) -> None:
        frac = rules.score_buying_triggers(
            [_signal("HIRING", "They posted a new VP Sales role on LinkedIn", days_ago=15)],
            ["new VP sales hire"],
            reference_date=_TODAY,
        )
        assert frac == 1.0

    def test_signal_matches_by_type_keyword(self) -> None:
        frac = rules.score_buying_triggers(
            [_signal("SERIES B FUNDING", "Closed $25M Series B", days_ago=20)],
            ["series b funding"],
            reference_date=_TODAY,
        )
        assert frac == 1.0

    def test_exactly_90_days_ago_included(self) -> None:
        frac = rules.score_buying_triggers(
            [_signal("HIRING", "new VP sales hire", days_ago=90)],
            ["new VP sales hire"],
            reference_date=_TODAY,
        )
        assert frac == 1.0

    def test_91_days_ago_excluded(self) -> None:
        frac = rules.score_buying_triggers(
            [_signal("HIRING", "new VP sales hire", days_ago=91)],
            ["new VP sales hire"],
            reference_date=_TODAY,
        )
        assert frac == 0.0

    def test_no_icp_triggers_defined_zero_points(self) -> None:
        ctx = _master_context(icp={"buying_triggers": []})
        result = score_account(_perfect_account(), ctx, reference_date=_TODAY)
        assert result.score_breakdown["buying_triggers"] == 0


# ---------------------------------------------------------------------------
# Negative ICP filter
# ---------------------------------------------------------------------------

class TestNegativeIcpFilter:
    def test_matching_domain_excluded(self, caplog) -> None:
        ctx = _master_context(icp={"negative_icp": ["competitor.com"]})
        competitor = RawCompany(**{**_perfect_account().model_dump(), "domain": "competitor.com"})
        other = _perfect_account()

        with caplog.at_level(logging.INFO, logger="backend.agents.icp_scout.scoring"):
            result = filter_negative_icp([competitor, other], ctx)

        assert len(result) == 1
        assert result[0].domain == "perfect.io"
        assert any("competitor.com" in r.message for r in caplog.records)

    def test_matching_company_name_excluded(self, caplog) -> None:
        ctx = _master_context(icp={"negative_icp": ["Bad Actor Inc"]})
        bad = RawCompany(**{
            **_perfect_account().model_dump(),
            "domain": "badactor.io",
            "company_name": "Bad Actor Inc",
        })
        with caplog.at_level(logging.INFO, logger="backend.agents.icp_scout.scoring"):
            result = filter_negative_icp([bad], ctx)

        assert len(result) == 0
        assert any("Bad Actor" in r.message for r in caplog.records)

    def test_logs_reason_for_each_exclusion(self, caplog) -> None:
        ctx = _master_context(icp={"negative_icp": ["competitor.com", "othercompetitor.com"]})
        accounts = [
            RawCompany(**{**_perfect_account().model_dump(), "domain": "competitor.com"}),
            RawCompany(**{**_perfect_account().model_dump(), "domain": "othercompetitor.com",
                          "company_name": "Other Competitor Co"}),
            _perfect_account(),
        ]
        with caplog.at_level(logging.INFO, logger="backend.agents.icp_scout.scoring"):
            kept = filter_negative_icp(accounts, ctx)

        assert len(kept) == 1
        # Per-account exclusion lines contain "matched_by="; the summary line does not
        exclusion_logs = [r for r in caplog.records
                          if "negative_icp_filter" in r.message and "matched_by" in r.message]
        assert len(exclusion_logs) == 2

    def test_empty_negative_icp_keeps_all(self) -> None:
        ctx = _master_context(icp={"negative_icp": []})
        accounts = [_perfect_account(), _zero_account()]
        result = filter_negative_icp(accounts, ctx)
        assert len(result) == 2

    def test_case_insensitive_match(self, caplog) -> None:
        ctx = _master_context(icp={"negative_icp": ["Competitor.COM"]})
        account = RawCompany(**{**_perfect_account().model_dump(), "domain": "competitor.com"})
        with caplog.at_level(logging.INFO, logger="backend.agents.icp_scout.scoring"):
            result = filter_negative_icp([account], ctx)
        assert len(result) == 0


# ---------------------------------------------------------------------------
# Tier assignment
# ---------------------------------------------------------------------------

class TestTierAssignment:
    @pytest.mark.parametrize("score,expected_tier", [
        (100, AccountTier.TIER_1),
        (80,  AccountTier.TIER_1),
        (79,  AccountTier.TIER_2),
        (60,  AccountTier.TIER_2),
        (59,  AccountTier.TIER_3),
        (0,   AccountTier.TIER_3),
    ])
    def test_tier_boundaries(self, score: int, expected_tier: AccountTier) -> None:
        """Tier assignment at every boundary value."""
        from backend.agents.icp_scout.scoring import _assign_tier
        assert _assign_tier(score) == expected_tier


# ---------------------------------------------------------------------------
# ScoredAccount.to_icp_account() round-trip
# ---------------------------------------------------------------------------

class TestScoredAccountToIcpAccount:
    def test_round_trip_produces_valid_icp_account(self) -> None:
        ctx = _master_context()
        scored = score_account(_perfect_account(), ctx, reference_date=_TODAY)
        icp_account = scored.to_icp_account()
        assert icp_account.icp_score == 100
        assert icp_account.tier == AccountTier.TIER_1
        assert icp_account.score_breakdown.industry == WEIGHTS["industry"]

    def test_breakdown_keys_match_schema_fields(self) -> None:
        ctx = _master_context()
        scored = score_account(_perfect_account(), ctx, reference_date=_TODAY)
        assert set(scored.score_breakdown.keys()) == {
            "industry", "company_size", "geography",
            "tech_stack", "funding_stage", "buying_triggers",
        }

    def test_zero_account_round_trip_passes_validation(self) -> None:
        """Even a zero-scoring account must produce a valid ICPAccount."""
        ctx = _master_context()
        zero = _zero_account()
        # zero_account has headcount=50000, which is outside the range but
        # headcount is valid integer — it scores 0 on size dimension.
        scored = score_account(zero, ctx, reference_date=_TODAY)
        icp_account = scored.to_icp_account()
        assert icp_account.tier == AccountTier.TIER_3


# ---------------------------------------------------------------------------
# Integration: filter then score pipeline
# ---------------------------------------------------------------------------

class TestFilterThenScore:
    def test_filter_before_score_removes_competitor(self) -> None:
        ctx = _master_context(icp={
            "negative_icp": ["competitor.com"],
            "buying_triggers": ["series b funding"],
        })
        accounts = [
            RawCompany(**{**_perfect_account().model_dump(), "domain": "competitor.com"}),
            _perfect_account(),
        ]
        kept = filter_negative_icp(accounts, ctx)
        assert len(kept) == 1
        scored = [score_account(a, ctx, reference_date=_TODAY) for a in kept]
        assert all(s.tier in (AccountTier.TIER_1, AccountTier.TIER_2, AccountTier.TIER_3)
                   for s in scored)

    def test_score_breakdown_never_negative(self) -> None:
        ctx = _master_context()
        for account in [_perfect_account(), _zero_account()]:
            scored = score_account(account, ctx, reference_date=_TODAY)
            for dim, pts in scored.score_breakdown.items():
                assert pts >= 0, f"Negative points for {dim}: {pts}"

    def test_score_never_exceeds_100(self) -> None:
        ctx = _master_context()
        result = score_account(_perfect_account(), ctx, reference_date=_TODAY)
        assert result.icp_score <= 100
