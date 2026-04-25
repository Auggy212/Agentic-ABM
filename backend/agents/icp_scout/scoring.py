"""
ICP Scout — scoring engine.

score_account(account, master_context) → ScoredAccount

Takes a normalised RawCompany (source-agnostic) and a MasterContext, applies
the six weighted dimensions, assigns a tier, and returns a ScoredAccount with
a full score_breakdown for UI display.

Weights (must sum to 100):
    industry_match          25
    company_size_match      20
    geography_match         15
    tech_stack_match        20
    funding_stage_match     10
    buying_trigger_signals  10

Tier thresholds:
    >= 80  → TIER_1
    60–79  → TIER_2
    <  60  → TIER_3
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import List, Optional, Union

from pydantic import AnyUrl, BaseModel, Field

from backend.schemas.models import (
    AccountTier,
    DataSource,
    FundingRound,
    ICPAccount,
    MasterContext,
    ScoreBreakdown,
    Signal,
)
from backend.agents.icp_scout import scoring_rules as rules

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Weights — do not modify. Sum must equal 100.
# ---------------------------------------------------------------------------

WEIGHTS: dict[str, int] = {
    "industry":         25,
    "company_size":     20,
    "geography":        15,
    "tech_stack":       20,
    "funding_stage":    10,
    "buying_triggers":  10,
}

assert sum(WEIGHTS.values()) == 100, (
    f"Scoring weights must sum to 100, got {sum(WEIGHTS.values())}"
)

# ---------------------------------------------------------------------------
# Tier boundaries — do not modify without updating models.py and schema JSON.
# ---------------------------------------------------------------------------

def _assign_tier(score: int) -> AccountTier:
    if score >= 80:
        return AccountTier.TIER_1
    if score >= 60:
        return AccountTier.TIER_2
    return AccountTier.TIER_3


# ---------------------------------------------------------------------------
# RawCompany — source-agnostic input schema
# ---------------------------------------------------------------------------

class RawSignal(BaseModel):
    """Normalised signal — source adapters map Apollo/Harmonic fields to this."""
    signal_type: str = Field(..., alias="type", description="Signal category")
    description: str = Field(..., description="Human-readable description")
    signal_date: date = Field(..., alias="date", description="Signal date YYYY-MM-DD")
    source_url: str = Field(..., description="Source URL or 'not_found'")

    model_config = {"populate_by_name": True, "extra": "ignore"}


class RawFundingRound(BaseModel):
    round: str = Field(..., description="Round label, e.g. 'Series B'")
    amount_usd: Union[int, str] = Field(..., description="Amount in USD or 'not_found'")
    date: str = Field(..., description="Close date YYYY-MM-DD or 'not_found'")

    model_config = {"extra": "ignore"}


class RawCompany(BaseModel):
    """
    Source-agnostic normalised company record.
    ICP Scout source adapters (Apollo, Harmonic, etc.) produce this before
    calling score_account(). No Apollo-specific field names appear here.
    """
    domain: str = Field(..., description="Apex domain — unique key")
    company_name: str = Field(..., description="Company display name")
    website: str = Field(..., description="Website URL")
    linkedin_url: Optional[str] = Field(None, description="LinkedIn URL or null")
    industry: str = Field(..., description="Primary industry vertical")
    headcount: Union[int, str] = Field(..., description="Employee count or 'not_found'")
    estimated_arr: str = Field(..., description="ARR range string or 'not_found'")
    funding_stage: str = Field(..., description="Current funding stage label")
    last_funding_round: RawFundingRound = Field(..., description="Most recent round")
    hq_location: str = Field(..., description="Headquarters city/country")
    technologies_used: List[str] = Field(default_factory=list, description="Detected technologies")
    recent_signals: List[RawSignal] = Field(default_factory=list, description="Recent signals")
    source: DataSource = Field(..., description="Enrichment data source")
    enriched_at: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))

    model_config = {"extra": "ignore"}


# ---------------------------------------------------------------------------
# ScoredAccount — output type
# ---------------------------------------------------------------------------

@dataclass
class ScoredAccount:
    """
    Result of scoring a single RawCompany against a MasterContext.
    score_breakdown is included for the frontend Account List "why" view.
    """
    domain: str
    company_name: str
    website: str
    linkedin_url: Optional[str]
    industry: str
    headcount: Union[int, str]
    estimated_arr: str
    funding_stage: str
    last_funding_round: RawFundingRound
    hq_location: str
    technologies_used: List[str]
    recent_signals: List[RawSignal]
    icp_score: int
    score_breakdown: dict  # {dimension: points_earned}
    tier: AccountTier
    source: DataSource
    enriched_at: datetime

    def to_icp_account(self) -> ICPAccount:
        """Convert to the canonical ICPAccount Pydantic model for API serialisation."""
        breakdown = ScoreBreakdown(
            industry=self.score_breakdown["industry"],
            company_size=self.score_breakdown["company_size"],
            geography=self.score_breakdown["geography"],
            tech_stack=self.score_breakdown["tech_stack"],
            funding_stage=self.score_breakdown["funding_stage"],
            buying_triggers=self.score_breakdown["buying_triggers"],
        )

        signals = [
            Signal(
                **{
                    "type": s.signal_type,
                    "date": s.signal_date,
                    "description": s.description,
                    "source_url": s.source_url,
                }
            )
            for s in self.recent_signals
        ]

        fr = self.last_funding_round
        funding_round = FundingRound(
            round=fr.round,
            amount_usd=fr.amount_usd,
            date=fr.date,
        )

        return ICPAccount(
            domain=self.domain,
            company_name=self.company_name,
            website=self.website,  # type: ignore[arg-type]
            linkedin_url=self.linkedin_url,  # type: ignore[arg-type]
            industry=self.industry,
            headcount=self.headcount,
            estimated_arr=self.estimated_arr,
            funding_stage=self.funding_stage,
            last_funding_round=funding_round,
            hq_location=self.hq_location,
            technologies_used=self.technologies_used,
            recent_signals=signals,
            icp_score=self.icp_score,
            score_breakdown=breakdown,
            tier=self.tier,
            source=self.source,
            enriched_at=self.enriched_at,
        )


# ---------------------------------------------------------------------------
# Negative ICP filter
# ---------------------------------------------------------------------------

def filter_negative_icp(
    accounts: List[RawCompany],
    master_context: MasterContext,
) -> List[RawCompany]:
    """
    Remove any account whose domain or company_name matches an entry in
    master_context.icp.negative_icp BEFORE scoring.

    Matching is case-insensitive. Logs each exclusion with reason.
    This is a hard rule — never bypass it.
    """
    negative = master_context.icp.negative_icp
    if not negative:
        return accounts

    # Normalise exclusion list once: lowercase domains/names
    exclusion_set = {e.strip().lower() for e in negative}

    kept: List[RawCompany] = []
    for account in accounts:
        domain_lower = account.domain.strip().lower()
        name_lower = account.company_name.strip().lower()

        matched_by: Optional[str] = None
        matched_value: Optional[str] = None

        for exclusion in exclusion_set:
            if exclusion in domain_lower or domain_lower in exclusion:
                matched_by = "domain"
                matched_value = exclusion
                break
            if exclusion in name_lower or name_lower in exclusion:
                matched_by = "company_name"
                matched_value = exclusion
                break

        if matched_by:
            logger.info(
                "negative_icp_filter: excluded domain=%r company=%r "
                "matched_by=%s matched_value=%r",
                account.domain,
                account.company_name,
                matched_by,
                matched_value,
            )
        else:
            kept.append(account)

    excluded_count = len(accounts) - len(kept)
    if excluded_count:
        logger.info(
            "negative_icp_filter: %d account(s) excluded from %d total",
            excluded_count,
            len(accounts),
        )

    return kept


# ---------------------------------------------------------------------------
# Main scoring function
# ---------------------------------------------------------------------------

def score_account(
    account: RawCompany,
    master_context: MasterContext,
    reference_date: date | None = None,
) -> ScoredAccount:
    """
    Score a single RawCompany against a MasterContext.

    reference_date is injected for deterministic testing (defaults to today).
    Returns a ScoredAccount with integer score, breakdown, and tier.
    """
    icp = master_context.icp

    # --- Compute fractional score per dimension ---
    industry_frac      = rules.score_industry(account.industry, icp.industries)
    company_size_frac  = rules.score_company_size(account.headcount, icp.company_size_employees)
    geography_frac     = rules.score_geography(account.hq_location, icp.geographies)
    tech_stack_frac    = rules.score_tech_stack(account.technologies_used, icp.tech_stack_signals)
    funding_frac       = rules.score_funding_stage(account.funding_stage, list(icp.funding_stage))
    triggers_frac      = rules.score_buying_triggers(
                             account.recent_signals, icp.buying_triggers, reference_date
                         )

    # --- Apply weights (floor to int; scores are whole points) ---
    industry_pts      = int(industry_frac      * WEIGHTS["industry"])
    company_size_pts  = int(company_size_frac  * WEIGHTS["company_size"])
    geography_pts     = int(geography_frac     * WEIGHTS["geography"])
    tech_stack_pts    = int(tech_stack_frac    * WEIGHTS["tech_stack"])
    funding_pts       = int(funding_frac       * WEIGHTS["funding_stage"])
    triggers_pts      = int(triggers_frac      * WEIGHTS["buying_triggers"])

    total = (
        industry_pts + company_size_pts + geography_pts
        + tech_stack_pts + funding_pts + triggers_pts
    )
    # Clamp to [0, 100] as a safety rail (shouldn't be needed given weights sum to 100)
    score = max(0, min(100, total))

    breakdown = {
        "industry":         industry_pts,
        "company_size":     company_size_pts,
        "geography":        geography_pts,
        "tech_stack":       tech_stack_pts,
        "funding_stage":    funding_pts,
        "buying_triggers":  triggers_pts,
    }

    tier = _assign_tier(score)

    logger.debug(
        "scored domain=%r score=%d tier=%s breakdown=%s",
        account.domain,
        score,
        tier.value,
        breakdown,
    )

    return ScoredAccount(
        domain=account.domain,
        company_name=account.company_name,
        website=account.website,
        linkedin_url=account.linkedin_url,
        industry=account.industry,
        headcount=account.headcount,
        estimated_arr=account.estimated_arr,
        funding_stage=account.funding_stage,
        last_funding_round=account.last_funding_round,
        hq_location=account.hq_location,
        technologies_used=account.technologies_used,
        recent_signals=account.recent_signals,
        icp_score=score,
        score_breakdown=breakdown,
        tier=tier,
        source=account.source,
        enriched_at=account.enriched_at,
    )
