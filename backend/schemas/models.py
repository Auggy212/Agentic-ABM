"""
Pydantic v2 models mirroring master_context.schema.json, icp_account.schema.json,
and icp_account_list.schema.json. These are the authoritative runtime validators
used by FastAPI for all request/response bodies in Phases 1–5.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Annotated, List, Optional, Union
from uuid import UUID

from pydantic import AnyUrl, BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Shared enums
# ---------------------------------------------------------------------------

class CompanyStage(str, Enum):
    SEED = "Seed"
    SERIES_A = "Series A"
    SERIES_B = "Series B"
    GROWTH = "Growth"
    ENTERPRISE = "Enterprise"


class PricingModel(str, Enum):
    SUBSCRIPTION = "Subscription"
    USAGE_BASED = "Usage-based"
    ONE_TIME = "One-time"
    ENTERPRISE = "Enterprise"


class Channel(str, Enum):
    LINKEDIN = "LinkedIn"
    EMAIL = "Email"
    WHATSAPP = "WhatsApp"
    PHONE = "Phone"


class CRM(str, Enum):
    HUBSPOT = "HubSpot"
    SALESFORCE = "Salesforce"
    ZOHO = "Zoho"
    OTHER = "Other"
    NONE = "None"


class AccountTier(str, Enum):
    TIER_1 = "TIER_1"
    TIER_2 = "TIER_2"
    TIER_3 = "TIER_3"


class DataSource(str, Enum):
    APOLLO = "APOLLO"
    HARMONIC = "HARMONIC"
    CRUNCHBASE = "CRUNCHBASE"
    BUILTWITH = "BUILTWITH"
    CLIENT_UPLOAD = "CLIENT_UPLOAD"


# ---------------------------------------------------------------------------
# Master Context sub-models
# ---------------------------------------------------------------------------

class Company(BaseModel):
    name: str = Field(..., min_length=1, description="Legal or common company name")
    website: AnyUrl = Field(..., description="Primary website URL")
    industry: str = Field(..., min_length=1, description="Primary industry vertical")
    stage: CompanyStage = Field(..., description="Current funding/growth stage")
    product: str = Field(..., min_length=1, description="One-line product description")
    value_prop: str = Field(..., min_length=1, description="Core value proposition")
    differentiators: List[str] = Field(..., description="Key competitive differentiators")
    pricing_model: PricingModel = Field(..., description="Primary pricing model")
    acv_range: str = Field(..., description="Annual contract value range, e.g. '$10k–$50k'")
    reference_customers: List[str] = Field(..., description="Named reference customers or logos")

    model_config = {"extra": "forbid"}


class ICP(BaseModel):
    industries: List[str] = Field(..., max_length=5, description="Target industries (max 5)")
    company_size_employees: str = Field(..., description="Employee headcount range, e.g. '50-500'")
    company_size_arr: str = Field(..., description="ARR range of target companies")
    funding_stage: List[str] = Field(..., description="Acceptable funding stages")
    geographies: List[str] = Field(..., description="Target geographic markets")
    tech_stack_signals: List[str] = Field(..., description="Technology signals indicating fit")
    buying_triggers: List[str] = Field(..., description="Events that create buying urgency")
    negative_icp: List[str] = Field(
        ...,
        description=(
            "REQUIRED. Explicit exclusion list. An empty list [] is a valid, "
            "intentional choice meaning 'no exclusions defined yet'. "
            "null / None is a validation error — it signals the field was omitted, "
            "which would silently poison downstream filtering agents."
        ),
    )

    model_config = {"extra": "forbid"}

    @field_validator("industries")
    @classmethod
    def max_five_industries(cls, v: List[str]) -> List[str]:
        if len(v) > 5:
            raise ValueError("industries must contain at most 5 entries")
        return v


class Buyers(BaseModel):
    titles: List[str] = Field(..., description="Target buyer job titles")
    seniority: List[str] = Field(..., description="Acceptable seniority levels, e.g. ['VP', 'Director']")
    buying_committee_size: str = Field(..., description="Typical committee size, e.g. '3-5'")
    pain_points: List[str] = Field(..., description="Explicit pains the buyer articulates")
    unstated_needs: List[str] = Field(..., description="Latent needs the buyer may not express")

    model_config = {"extra": "forbid"}


class Competitor(BaseModel):
    name: str = Field(..., min_length=1, description="Competitor name")
    weaknesses: List[str] = Field(..., description="Known weaknesses to exploit in positioning")

    model_config = {"extra": "forbid"}


class GTM(BaseModel):
    win_themes: List[str] = Field(..., description="Recurring themes in won deals")
    loss_themes: List[str] = Field(..., description="Recurring themes in lost deals")
    channels: List[Channel] = Field(..., description="Outreach channels in scope")
    crm: CRM = Field(..., description="Primary CRM platform")
    existing_account_list: Optional[str] = Field(
        None,
        description="CSV upload reference path or URL; null if not provided",
    )

    model_config = {"extra": "forbid"}


class Meta(BaseModel):
    created_at: datetime = Field(..., description="ISO 8601 creation timestamp")
    client_id: UUID = Field(..., description="Unique client/tenant UUID")
    version: str = Field(
        ...,
        pattern=r"^\d+\.\d+\.\d+$",
        description="Semver version string, starts at 1.0.0",
    )

    model_config = {"extra": "forbid"}


class MasterContext(BaseModel):
    """
    Root model for the Master Context JSON produced by the Intake Agent.
    Validated by every downstream Phase 1–5 agent before use.
    """

    company: Company = Field(..., description="Company profile")
    icp: ICP = Field(..., description="Ideal Customer Profile parameters")
    buyers: Buyers = Field(..., description="Target buyer personas")
    competitors: List[Competitor] = Field(..., description="Competitive landscape")
    gtm: GTM = Field(..., description="Go-to-market parameters")
    meta: Meta = Field(..., description="Document metadata")

    model_config = {"extra": "forbid"}


# ---------------------------------------------------------------------------
# ICP Account sub-models
# ---------------------------------------------------------------------------

NOT_FOUND = "not_found"

HeadcountField = Union[int, str]   # int >= 0  OR  literal "not_found"
ArrField = str                      # human-readable range OR "not_found"


class FundingRound(BaseModel):
    round: str = Field(..., description="Round label, e.g. 'Series B'")
    amount_usd: Union[int, str] = Field(
        ...,
        description="USD amount as integer, or 'not_found'",
    )
    date: str = Field(
        ...,
        description="Round close date (YYYY-MM-DD) or 'not_found'",
    )

    model_config = {"extra": "forbid"}

    @field_validator("amount_usd", mode="before")
    @classmethod
    def validate_amount(cls, v: object) -> object:
        if isinstance(v, int) and v < 0:
            raise ValueError("amount_usd must be >= 0")
        if isinstance(v, str) and v != NOT_FOUND:
            raise ValueError(f"amount_usd string must be '{NOT_FOUND}' or an integer")
        return v

    @field_validator("date", mode="before")
    @classmethod
    def validate_date(cls, v: object) -> object:
        if isinstance(v, str):
            if v == NOT_FOUND:
                return v
            try:
                date.fromisoformat(v)
                return v
            except ValueError:
                raise ValueError(f"date must be ISO date string (YYYY-MM-DD) or '{NOT_FOUND}'")
        if isinstance(v, date):
            return v.isoformat()
        raise ValueError(f"date must be a string or date, got {type(v)}")


class Signal(BaseModel):
    signal_type: str = Field(..., alias="type", description="Signal category, e.g. 'JOB_POSTING', 'FUNDING'")
    description: str = Field(..., description="Human-readable signal description")
    signal_date: date = Field(..., alias="date", description="Signal date (YYYY-MM-DD)")
    source_url: str = Field(
        ...,
        description="Source URL or 'not_found'",
    )

    model_config = {"extra": "forbid", "populate_by_name": True}

    @field_validator("source_url", mode="before")
    @classmethod
    def validate_source_url(cls, v: object) -> object:
        if isinstance(v, str):
            if v == NOT_FOUND:
                return v
            if not (v.startswith("http://") or v.startswith("https://")):
                raise ValueError(f"source_url must be a valid http/https URL or '{NOT_FOUND}'")
            return v
        raise ValueError(f"source_url must be a string, got {type(v)}")


class ScoreBreakdown(BaseModel):
    industry: int = Field(..., ge=0, description="Points awarded for industry match")
    company_size: int = Field(..., ge=0, description="Points awarded for company size match")
    geography: int = Field(..., ge=0, description="Points awarded for geography match")
    tech_stack: int = Field(..., ge=0, description="Points awarded for tech stack signals")
    funding_stage: int = Field(..., ge=0, description="Points awarded for funding stage match")
    buying_triggers: int = Field(..., ge=0, description="Points awarded for buying trigger signals")

    model_config = {"extra": "forbid"}


class ICPAccount(BaseModel):
    """
    A single scored account produced by ICP Scout.
    The tier field must be consistent with icp_score:
      TIER_1 → 80–100, TIER_2 → 60–79, TIER_3 → 0–59.
    """

    domain: str = Field(..., description="Apex domain — unique key, e.g. 'acme.com'")
    company_name: str = Field(..., min_length=1, description="Company display name")
    website: AnyUrl = Field(..., description="Company website URL")
    linkedin_url: Optional[AnyUrl] = Field(None, description="LinkedIn company page URL or null")
    industry: str = Field(..., description="Primary industry vertical")
    headcount: Union[int, str] = Field(
        ...,
        description="Employee headcount integer, or 'not_found'",
    )
    estimated_arr: str = Field(
        ...,
        description="Estimated ARR as a range string, or 'not_found'",
    )
    funding_stage: str = Field(..., description="Current funding stage label")
    last_funding_round: FundingRound = Field(..., description="Most recent funding round details")
    hq_location: str = Field(..., description="Headquarters city/country")
    technologies_used: List[str] = Field(..., description="Detected technologies")
    recent_signals: List[Signal] = Field(..., description="Recent buying signals")
    icp_score: int = Field(..., ge=0, le=100, description="Composite ICP score 0–100")
    score_breakdown: ScoreBreakdown = Field(..., description="Per-dimension score components")
    tier: AccountTier = Field(
        ...,
        description="TIER_1: 80–100 | TIER_2: 60–79 | TIER_3: 0–59",
    )
    source: DataSource = Field(..., description="Data enrichment source")
    enriched_at: datetime = Field(..., description="ISO 8601 enrichment timestamp")

    model_config = {"extra": "forbid"}

    @field_validator("headcount", mode="before")
    @classmethod
    def validate_headcount(cls, v: object) -> object:
        if isinstance(v, int) and v < 0:
            raise ValueError("headcount must be >= 0")
        if isinstance(v, str) and v != NOT_FOUND:
            raise ValueError(f"headcount string must be '{NOT_FOUND}' or an integer")
        return v

    @model_validator(mode="after")
    def tier_consistent_with_score(self) -> ICPAccount:
        score = self.icp_score
        tier = self.tier
        if score >= 80 and tier != AccountTier.TIER_1:
            raise ValueError(f"icp_score={score} requires TIER_1, got {tier.value}")
        if 60 <= score < 80 and tier != AccountTier.TIER_2:
            raise ValueError(f"icp_score={score} requires TIER_2, got {tier.value}")
        if score < 60 and tier != AccountTier.TIER_3:
            raise ValueError(f"icp_score={score} requires TIER_3, got {tier.value}")
        return self


# ---------------------------------------------------------------------------
# ICP Account List envelope
# ---------------------------------------------------------------------------

class TierBreakdown(BaseModel):
    tier_1: int = Field(..., ge=0, description="Number of TIER_1 accounts")
    tier_2: int = Field(..., ge=0, description="Number of TIER_2 accounts")
    tier_3: int = Field(..., ge=0, description="Number of TIER_3 accounts")

    model_config = {"extra": "forbid"}


class AccountListMeta(BaseModel):
    total_found: int = Field(..., ge=0, description="Total accounts in this list")
    tier_breakdown: TierBreakdown = Field(..., description="Count of accounts per tier")
    generated_at: datetime = Field(..., description="ISO 8601 generation timestamp")
    client_id: UUID = Field(..., description="Client/tenant UUID")

    model_config = {"extra": "forbid"}


class ICPAccountList(BaseModel):
    """
    Envelope returned by ICP Scout containing scored accounts and run metadata.
    """

    accounts: List[ICPAccount] = Field(..., description="Scored and tiered accounts")
    meta: AccountListMeta = Field(..., description="Run metadata and tier summary")

    model_config = {"extra": "forbid"}
