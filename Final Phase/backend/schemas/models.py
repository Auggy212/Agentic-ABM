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

from pydantic import AnyUrl, BaseModel, Field, RootModel, field_validator, model_validator


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


# ---------------------------------------------------------------------------
# Phase 2 Buyer Intel models
# ---------------------------------------------------------------------------

class Seniority(str, Enum):
    C_SUITE = "C_SUITE"
    VP = "VP"
    DIRECTOR = "DIRECTOR"
    MANAGER = "MANAGER"
    INDIVIDUAL_CONTRIBUTOR = "INDIVIDUAL_CONTRIBUTOR"
    UNKNOWN = "UNKNOWN"


class EmailStatus(str, Enum):
    UNVERIFIED = "UNVERIFIED"
    VALID = "VALID"
    INVALID = "INVALID"
    CATCH_ALL = "CATCH_ALL"
    RISKY = "RISKY"
    NOT_FOUND = "NOT_FOUND"


class CommitteeRole(str, Enum):
    DECISION_MAKER = "DECISION_MAKER"
    CHAMPION = "CHAMPION"
    BLOCKER = "BLOCKER"
    INFLUENCER = "INFLUENCER"


class BuyerSource(str, Enum):
    APOLLO = "APOLLO"
    CLAY = "CLAY"
    LINKEDIN_MANUAL = "LINKEDIN_MANUAL"


class PastExperience(BaseModel):
    company: str
    title: str
    start_date: str
    end_date: str

    model_config = {"extra": "forbid"}


class RecentActivityItem(BaseModel):
    type: str
    content_summary: str = Field(..., max_length=300)
    posted_at: datetime
    url: AnyUrl

    model_config = {"extra": "forbid"}


class InferredPainPoint(BaseModel):
    pain_point: str
    source: str
    confidence: float = Field(..., ge=0.0, le=1.0)

    model_config = {"extra": "forbid"}


class BuyerProfile(BaseModel):
    contact_id: UUID
    account_domain: str
    full_name: str = Field(..., min_length=1)
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    current_title: str
    apollo_title: str
    title_mismatch_flag: bool
    seniority: Seniority
    department: str
    email: Optional[str] = None
    email_status: EmailStatus = EmailStatus.UNVERIFIED
    phone: Optional[str] = None
    linkedin_url: Optional[AnyUrl] = None
    tenure_current_role_months: Union[int, str]
    tenure_current_company_months: Union[int, str]
    past_experience: List[PastExperience] = Field(default_factory=list, max_length=3)
    recent_activity: List[RecentActivityItem] = Field(default_factory=list)
    job_change_signal: bool
    committee_role: CommitteeRole
    committee_role_confidence: float = Field(..., ge=0.0, le=1.0)
    committee_role_reasoning: str
    inferred_pain_points: List[InferredPainPoint] = Field(default_factory=list)
    source: BuyerSource
    enriched_at: datetime

    model_config = {"extra": "forbid"}

    @field_validator("tenure_current_role_months", "tenure_current_company_months")
    @classmethod
    def validate_tenure(cls, v: object) -> object:
        if isinstance(v, int) and v >= 0:
            return v
        if isinstance(v, str) and v == NOT_FOUND:
            return v
        raise ValueError(f"tenure must be a non-negative integer or '{NOT_FOUND}'")


class BuyerIntelMeta(BaseModel):
    total_accounts_processed: int = Field(..., ge=0)
    total_contacts_found: int = Field(..., ge=0)
    contacts_per_account_avg: float = Field(..., ge=0.0)
    hunter_quota_used: int = Field(..., ge=0)
    apollo_quota_used: int = Field(..., ge=0)
    mismatches_flagged: int = Field(..., ge=0)
    quota_warnings: List[dict] = Field(default_factory=list)
    pending_domains: List[str] = Field(default_factory=list)
    status: str = "complete"

    model_config = {"extra": "ignore"}


class BuyerIntelPackage(BaseModel):
    client_id: UUID
    generated_at: datetime
    accounts: dict[str, List[BuyerProfile]]
    meta: BuyerIntelMeta

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def max_five_contacts_per_account(self) -> "BuyerIntelPackage":
        for domain, contacts in self.accounts.items():
            if len(contacts) > 5:
                raise ValueError(f"{domain} has more than 5 BuyerProfile records")
        return self


# ---------------------------------------------------------------------------
# Phase 2 Signal Intelligence models
# ---------------------------------------------------------------------------

class EvidenceStatus(str, Enum):
    VERIFIED = "VERIFIED"
    INFERRED = "INFERRED"


class IntentLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class SignalType(str, Enum):
    COMPETITOR_REVIEW = "COMPETITOR_REVIEW"
    RELEVANT_HIRE = "RELEVANT_HIRE"
    FUNDING = "FUNDING"
    LEADERSHIP_HIRE = "LEADERSHIP_HIRE"
    EXPANSION = "EXPANSION"
    EXEC_CONTENT = "EXEC_CONTENT"
    WEBINAR_ATTENDED = "WEBINAR_ATTENDED"
    COMPETITOR_ENGAGEMENT = "COMPETITOR_ENGAGEMENT"
    LEADERSHIP_CHANGE = "LEADERSHIP_CHANGE"
    ICP_MATCH_NO_SIGNAL = "ICP_MATCH_NO_SIGNAL"
    INDUSTRY_EVENT = "INDUSTRY_EVENT"
    COMPETITOR_FOLLOW = "COMPETITOR_FOLLOW"


class SignalSource(str, Enum):
    LINKEDIN_JOBS = "LINKEDIN_JOBS"
    GOOGLE_NEWS = "GOOGLE_NEWS"
    G2 = "G2"
    CRUNCHBASE = "CRUNCHBASE"
    REDDIT = "REDDIT"


class BuyingStage(str, Enum):
    UNAWARE = "UNAWARE"
    PROBLEM_AWARE = "PROBLEM_AWARE"
    SOLUTION_AWARE = "SOLUTION_AWARE"
    EVALUATING = "EVALUATING"
    READY_TO_BUY = "READY_TO_BUY"


class BuyingStageMethod(str, Enum):
    RULES = "RULES"
    LLM_TIEBREAKER = "LLM_TIEBREAKER"


class AccountSignal(BaseModel):
    signal_id: UUID
    type: SignalType
    intent_level: IntentLevel
    description: str
    source: SignalSource
    source_url: AnyUrl
    detected_at: datetime
    evidence_snippet: str = Field(..., max_length=500)

    model_config = {"extra": "forbid"}


class SignalScore(BaseModel):
    high_count: int = Field(..., ge=0)
    medium_count: int = Field(..., ge=0)
    low_count: int = Field(..., ge=0)
    total_score: int = Field(..., ge=0)

    model_config = {"extra": "forbid"}


class StrategicPriority(BaseModel):
    priority: str
    evidence: str
    evidence_status: EvidenceStatus
    source_url: str

    model_config = {"extra": "forbid"}


class CompetitiveLandscapeItem(BaseModel):
    competitor_name: str
    evidence: str
    evidence_status: EvidenceStatus
    source_url: str

    model_config = {"extra": "forbid"}


CompetitiveLandscapeEntry = CompetitiveLandscapeItem


class IntelInferredPainPoint(BaseModel):
    pain_point: str
    evidence_status: EvidenceStatus
    reasoning: str

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def must_be_inferred(self) -> "IntelInferredPainPoint":
        if self.evidence_status != EvidenceStatus.INFERRED:
            raise ValueError("IntelReport inferred_pain_points must always be INFERRED")
        return self


class RecentNewsItem(BaseModel):
    headline: str
    date: date
    source_url: AnyUrl
    summary: str

    model_config = {"extra": "forbid"}


class GeneratedBy(BaseModel):
    researcher: str
    synthesizer: str

    model_config = {"extra": "forbid"}


class IntelReport(BaseModel):
    company_snapshot: str
    strategic_priorities: List[StrategicPriority]
    tech_stack: List[str]
    competitive_landscape: List[CompetitiveLandscapeItem]
    inferred_pain_points: List[IntelInferredPainPoint]
    recent_news: List[RecentNewsItem] = Field(..., max_length=3)
    buying_committee_summary: str
    recommended_angle: str
    generated_by: GeneratedBy
    generated_at: datetime

    model_config = {"extra": "forbid"}


class SignalReport(BaseModel):
    account_domain: str
    tier: AccountTier
    signals: List[AccountSignal]
    signal_score: SignalScore
    buying_stage: BuyingStage
    buying_stage_method: BuyingStageMethod
    buying_stage_reasoning: str
    recommended_outreach_approach: str
    intel_report: Optional[IntelReport] = None

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def intel_report_tier_rules(self) -> "SignalReport":
        if self.tier != AccountTier.TIER_1 and self.intel_report is not None:
            raise ValueError("intel_report is TIER_1 only")
        return self


class SignalIntelligence(RootModel[dict[str, SignalReport]]):
    pass


# ---------------------------------------------------------------------------
# Phase 3 Verification models
# ---------------------------------------------------------------------------

class EmailFinalStatus(str, Enum):
    VALID = "VALID"
    INVALID = "INVALID"
    CATCH_ALL = "CATCH_ALL"
    RISKY = "RISKY"
    NOT_FOUND = "NOT_FOUND"


class EngineName(str, Enum):
    NEVERBOUNCE = "NEVERBOUNCE"
    ZEROBOUNCE = "ZEROBOUNCE"


class RelookupSource(str, Enum):
    HUNTER = "HUNTER"


class RelookupBlockedReason(str, Enum):
    QUOTA_EXHAUSTED = "QUOTA_EXHAUSTED"
    NO_MATCH = "NO_MATCH"


class ResolutionMethod(str, Enum):
    LINKEDIN_PRIMARY = "LINKEDIN_PRIMARY"
    APOLLO_FALLBACK = "APOLLO_FALLBACK"
    NO_RECONCILIATION_POSSIBLE = "NO_RECONCILIATION_POSSIBLE"


class VerificationIssueSeverity(str, Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"


class EmailEngineResult(BaseModel):
    status: EmailFinalStatus
    confidence: float = Field(..., ge=0.0, le=1.0)
    sub_status: str
    checked_at: datetime

    model_config = {"extra": "forbid"}


class EmailVerification(BaseModel):
    email: str
    status: EmailFinalStatus
    primary_engine: EngineName
    secondary_engine: Optional[EngineName] = None
    primary_result: EmailEngineResult
    secondary_result: Optional[EmailEngineResult] = None
    relookup_attempted: bool
    relookup_source: Optional[RelookupSource] = None
    relookup_email: Optional[str] = None
    relookup_blocked_reason: Optional[RelookupBlockedReason] = None
    final_status: EmailFinalStatus

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_cross_fields(self) -> "EmailVerification":
        if self.secondary_engine == EngineName.ZEROBOUNCE and self.secondary_result is None:
            raise ValueError("secondary_engine=ZEROBOUNCE requires secondary_result")
        if self.secondary_engine is None and self.secondary_result is not None:
            raise ValueError("secondary_result must be null when secondary_engine is null")
        if self.relookup_attempted and not self.relookup_email and not self.relookup_blocked_reason:
            raise ValueError("relookup_attempted requires relookup_email or relookup_blocked_reason")
        return self


class LinkedinCheck(BaseModel):
    url: Optional[str]
    reachable: bool
    http_status: Optional[int] = Field(None, ge=100, le=999)
    check_authoritative: bool = True
    checked_at: datetime

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_authority(self) -> "LinkedinCheck":
        if self.http_status == 999 and self.check_authoritative:
            raise ValueError("LinkedIn HTTP 999 checks are non-authoritative")
        if self.http_status is not None and self.http_status != 999 and not self.check_authoritative:
            raise ValueError("non-999 LinkedIn checks must be authoritative")
        return self


class WebsiteCheck(BaseModel):
    domain: str
    reachable: bool
    http_status: Optional[int] = Field(None, ge=100, le=599)
    checked_at: datetime

    model_config = {"extra": "forbid"}


class TitleReconciliation(BaseModel):
    apollo_title: str
    linkedin_title: Optional[str] = None
    resolved_title: str
    resolution_method: ResolutionMethod
    mismatch_resolved: bool

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_linkedin_title(self) -> "TitleReconciliation":
        if self.resolution_method == ResolutionMethod.LINKEDIN_PRIMARY and not self.linkedin_title:
            raise ValueError("LINKEDIN_PRIMARY requires linkedin_title")
        return self


class JobChangeVerification(BaseModel):
    apollo_claimed: bool
    linkedin_confirmed: Optional[bool]
    verified: bool
    confidence: float = Field(..., ge=0.0, le=1.0)

    model_config = {"extra": "forbid"}


class VerificationIssue(BaseModel):
    severity: VerificationIssueSeverity
    code: str
    message: str

    model_config = {"extra": "forbid"}


class VerificationResult(BaseModel):
    contact_id: UUID
    account_domain: str
    email_verification: EmailVerification
    linkedin_check: LinkedinCheck
    website_check: WebsiteCheck
    title_reconciliation: TitleReconciliation
    job_change_verification: JobChangeVerification
    overall_data_quality_score: int = Field(..., ge=0, le=100)
    issues: List[VerificationIssue]
    verified_at: datetime

    model_config = {"extra": "forbid"}


class SourceBreakdown(BaseModel):
    total: int = Field(..., ge=0)
    valid: int = Field(..., ge=0)
    invalid: int = Field(..., ge=0)
    pass_rate: float = Field(..., ge=0.0, le=1.0)

    model_config = {"extra": "forbid"}


class PerSourceBreakdown(BaseModel):
    apollo: SourceBreakdown
    hunter: SourceBreakdown
    clay: Optional[SourceBreakdown] = None
    linkedin_manual: Optional[SourceBreakdown] = None

    model_config = {"extra": "forbid"}


class VerificationAggregate(BaseModel):
    total_contacts: int = Field(..., ge=0)
    valid_emails: int = Field(..., ge=0)
    invalid_emails: int = Field(..., ge=0)
    catch_all: int = Field(..., ge=0)
    risky: int = Field(..., ge=0)
    not_found: int = Field(..., ge=0)
    deliverability_rate: float = Field(..., ge=0.0, le=1.0)
    linkedin_reachable_rate: float = Field(..., ge=0.0, le=1.0)
    linkedin_authoritative_rate: float = Field(0.0, ge=0.0, le=1.0)
    website_reachable_rate: float = Field(..., ge=0.0, le=1.0)
    title_mismatches_resolved: int = Field(..., ge=0)
    job_changes_verified: int = Field(..., ge=0)

    model_config = {"extra": "forbid"}


class QuotaUsage(BaseModel):
    neverbounce_used_this_run: int = Field(..., ge=0)
    zerobounce_used_this_run: int = Field(..., ge=0)
    hunter_used_this_run: int = Field(..., ge=0)
    neverbounce_remaining: int = Field(..., ge=0)
    zerobounce_remaining: int = Field(..., ge=0)
    hunter_remaining: int = Field(..., ge=0)

    model_config = {"extra": "forbid"}


class VerifiedDataPackage(BaseModel):
    client_id: UUID
    generated_at: datetime
    verifications: List[VerificationResult]
    per_source_breakdown: PerSourceBreakdown
    aggregate: VerificationAggregate
    quota_usage: QuotaUsage
    meets_deliverability_target: bool
    target_miss_diagnosis: Optional[str]

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_target_diagnosis(self) -> "VerifiedDataPackage":
        target_met = self.aggregate.deliverability_rate >= 0.9
        if self.meets_deliverability_target != target_met:
            raise ValueError("meets_deliverability_target must match deliverability_rate >= 0.9")
        if not target_met and not self.target_miss_diagnosis:
            raise ValueError("target_miss_diagnosis is required when deliverability target is missed")
        if target_met and self.target_miss_diagnosis is not None:
            raise ValueError("target_miss_diagnosis must be null when target is met")
        return self


# ---------------------------------------------------------------------------
# Phase 3 Recent Activity stub models
# ---------------------------------------------------------------------------

class DataFreshness(str, Enum):
    FRESH = "FRESH"
    RECENT = "RECENT"
    STALE = "STALE"


class RecentActivitySource(str, Enum):
    PHANTOMBUSTER = "PHANTOMBUSTER"


class RecentActivityPost(BaseModel):
    post_id: str
    content_summary: str
    posted_at: datetime
    post_url: str
    engagement: dict

    model_config = {"extra": "forbid"}


class RecentActivityComment(BaseModel):
    comment_id: str
    target_post_url: str
    content_summary: str
    posted_at: datetime

    model_config = {"extra": "forbid"}


class RecentActivityLike(BaseModel):
    target_post_url: str
    target_author: str
    posted_at: datetime

    model_config = {"extra": "forbid"}


class RecentActivityStub(BaseModel):
    """Phase 3 stub. Phase 5 fills this via PhantomBuster."""

    contact_id: UUID
    posts: List[RecentActivityPost] = Field(default_factory=list)
    comments: List[RecentActivityComment] = Field(default_factory=list)
    likes: List[RecentActivityLike] = Field(default_factory=list)
    last_active_at: Optional[datetime] = None
    data_freshness: DataFreshness
    source: RecentActivitySource
    scraped_at: datetime

    model_config = {"extra": "forbid"}


# ---------------------------------------------------------------------------
# Phase 3 Checkpoint 2 review models
# ---------------------------------------------------------------------------

class ReviewDecision(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    CORRECTED = "CORRECTED"
    REMOVED = "REMOVED"


class AccountDecision(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    NEEDS_REVISION = "NEEDS_REVISION"
    REMOVED_FROM_PIPELINE = "REMOVED_FROM_PIPELINE"


class ClaimSourceType(str, Enum):
    BUYER_PAIN_POINT = "BUYER_PAIN_POINT"
    INTEL_REPORT_PRIORITY = "INTEL_REPORT_PRIORITY"
    INTEL_REPORT_COMPETITOR = "INTEL_REPORT_COMPETITOR"
    INTEL_REPORT_PAIN = "INTEL_REPORT_PAIN"
    INTEL_REPORT_OTHER = "INTEL_REPORT_OTHER"


class CP2Status(str, Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_REVIEW = "IN_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class CP2BlockerType(str, Enum):
    UNREVIEWED_CLAIMS = "UNREVIEWED_CLAIMS"
    UNAPPROVED_ACCOUNTS = "UNAPPROVED_ACCOUNTS"
    MISSING_REVIEWER = "MISSING_REVIEWER"


class CP2Blocker(BaseModel):
    type: CP2BlockerType
    message: str

    model_config = {"extra": "forbid"}


class InferredClaimReview(BaseModel):
    claim_id: UUID
    source_type: ClaimSourceType
    account_domain: str
    contact_id: Optional[UUID]
    claim_text: str = Field(..., min_length=1)
    evidence_status: EvidenceStatus
    reasoning: str
    review_decision: ReviewDecision
    corrected_text: Optional[str] = None
    review_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_review_state(self) -> "InferredClaimReview":
        if self.evidence_status != EvidenceStatus.INFERRED:
            raise ValueError("CP2 review claims must be INFERRED")
        if self.source_type == ClaimSourceType.BUYER_PAIN_POINT and self.contact_id is None:
            raise ValueError("BUYER_PAIN_POINT requires contact_id")
        if self.source_type != ClaimSourceType.BUYER_PAIN_POINT and self.contact_id is not None:
            raise ValueError("contact_id must be null for intel report claims")
        if self.review_decision == ReviewDecision.CORRECTED:
            if not self.corrected_text:
                raise ValueError("CORRECTED requires non-empty corrected_text")
        elif self.corrected_text is not None:
            raise ValueError("corrected_text must be null unless decision is CORRECTED")
        if self.review_decision == ReviewDecision.PENDING and self.reviewed_at is not None:
            raise ValueError("reviewed_at must be null while decision is PENDING")
        if self.review_decision != ReviewDecision.PENDING and self.reviewed_at is None:
            raise ValueError("reviewed_at is required for reviewed claims")
        return self


class AccountApproval(BaseModel):
    account_domain: str
    buyer_profiles_approved: bool
    intel_report_approved: Optional[bool]
    account_decision: AccountDecision
    account_notes: Optional[str] = None

    model_config = {"extra": "forbid"}


class CP2AggregateProgress(BaseModel):
    total_inferred_claims: int = Field(..., ge=0)
    reviewed_claims: int = Field(..., ge=0)
    approved_claims: int = Field(..., ge=0)
    corrected_claims: int = Field(..., ge=0)
    removed_claims: int = Field(..., ge=0)
    total_accounts: int = Field(..., ge=0)
    approved_accounts: int = Field(..., ge=0)
    removed_accounts: int = Field(..., ge=0)

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_counts(self) -> "CP2AggregateProgress":
        if self.reviewed_claims != self.approved_claims + self.corrected_claims + self.removed_claims:
            raise ValueError("reviewed_claims must equal approved + corrected + removed")
        if self.reviewed_claims > self.total_inferred_claims:
            raise ValueError("reviewed_claims cannot exceed total_inferred_claims")
        if self.approved_accounts + self.removed_accounts > self.total_accounts:
            raise ValueError("approved + removed accounts cannot exceed total_accounts")
        return self


class CP2ReviewState(BaseModel):
    client_id: UUID
    status: CP2Status
    opened_at: Optional[datetime]
    approved_at: Optional[datetime]
    reviewer: str
    reviewer_notes: Optional[str]
    inferred_claims_review: List[InferredClaimReview]
    account_approvals: List[AccountApproval]
    aggregate_progress: CP2AggregateProgress
    blockers: List[CP2Blocker] = Field(default_factory=list)

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_state(self) -> "CP2ReviewState":
        if self.status == CP2Status.NOT_STARTED and self.opened_at is not None:
            raise ValueError("opened_at must be null when status is NOT_STARTED")
        if self.status == CP2Status.APPROVED:
            if self.approved_at is None:
                raise ValueError("APPROVED status requires approved_at timestamp")
            if any(c.review_decision == ReviewDecision.PENDING for c in self.inferred_claims_review):
                raise ValueError("CP2 cannot be APPROVED while claims are still PENDING")
            if any(a.account_decision == AccountDecision.PENDING for a in self.account_approvals):
                raise ValueError("CP2 cannot be APPROVED until every account decided")
        elif self.approved_at is not None:
            raise ValueError("approved_at must be null unless status is APPROVED")
        if self.aggregate_progress.total_inferred_claims != len(self.inferred_claims_review):
            raise ValueError("total_inferred_claims must equal inferred_claims_review length")
        if self.aggregate_progress.total_accounts != len(self.account_approvals):
            raise ValueError("total_accounts must equal account_approvals length")
        return self


# ---------------------------------------------------------------------------
# Phase 4 Storyteller / CP3 models
# ---------------------------------------------------------------------------
#
# Note on naming: Phase 1 already defined `Channel` (the GTM-level outreach
# channel set used in MasterContext.gtm.channels). Phase 4 needs a different,
# finer-grained per-message channel — so we introduce `MessageChannel` rather
# than overloading the existing enum. See README "Phase 4" section.


class MessageChannel(str, Enum):
    LINKEDIN_CONNECTION = "LINKEDIN_CONNECTION"
    LINKEDIN_DM = "LINKEDIN_DM"
    EMAIL = "EMAIL"
    WHATSAPP = "WHATSAPP"
    REDDIT_STRATEGY_NOTE = "REDDIT_STRATEGY_NOTE"


class MessageEngine(str, Enum):
    ANTHROPIC_CLAUDE = "ANTHROPIC_CLAUDE"
    OPENAI_GPT_4O_MINI = "OPENAI_GPT_4O_MINI"


class MessageEngineTarget(str, Enum):
    ANTHROPIC_CLAUDE = "ANTHROPIC_CLAUDE"
    OPENAI_GPT_4O_MINI = "OPENAI_GPT_4O_MINI"
    ANY = "ANY"


class TierTarget(str, Enum):
    TIER_1 = "TIER_1"
    TIER_2 = "TIER_2"
    TIER_3 = "TIER_3"
    ALL = "ALL"


class MessageSourceType(str, Enum):
    INTEL_REPORT_PRIORITY = "INTEL_REPORT_PRIORITY"
    INTEL_REPORT_COMPETITOR = "INTEL_REPORT_COMPETITOR"
    INTEL_REPORT_PAIN = "INTEL_REPORT_PAIN"
    BUYER_PAIN_POINT = "BUYER_PAIN_POINT"
    JOB_CHANGE_SIGNAL = "JOB_CHANGE_SIGNAL"
    SIGNAL_TIMELINE = "SIGNAL_TIMELINE"
    MASTER_CONTEXT_VALUE_PROP = "MASTER_CONTEXT_VALUE_PROP"
    MASTER_CONTEXT_WIN_THEME = "MASTER_CONTEXT_WIN_THEME"
    RECENT_ACTIVITY = "RECENT_ACTIVITY"
    UNTRACED = "UNTRACED"


class TraceabilityState(str, Enum):
    PASSED = "PASSED"
    SOFT_FAIL = "SOFT_FAIL"
    HARD_FAIL = "HARD_FAIL"


class DiversityState(str, Enum):
    PASSED = "PASSED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class FreshnessState(str, Enum):
    PASSED = "PASSED"
    FAILED = "FAILED"


class MessageReviewState(str, Enum):
    PENDING = "PENDING"
    DRAFT_VALIDATED = "DRAFT_VALIDATED"
    EDITED_BY_OPERATOR = "EDITED_BY_OPERATOR"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    REQUIRES_REGENERATION = "REQUIRES_REGENERATION"


class PersonalizationLayerName(str, Enum):
    ACCOUNT_HOOK = "account_hook"
    BUYER_HOOK = "buyer_hook"
    PAIN = "pain"
    VALUE = "value"


class PersonalizationLayer(BaseModel):
    text: str
    source_claim_id: Optional[UUID] = None
    source_type: MessageSourceType
    untraced: bool

    model_config = {"extra": "forbid"}


class PersonalizationLayers(BaseModel):
    account_hook: PersonalizationLayer
    buyer_hook: PersonalizationLayer
    pain: PersonalizationLayer
    value: PersonalizationLayer

    model_config = {"extra": "forbid"}


class TokenUsage(BaseModel):
    input_tokens: int = Field(..., ge=0)
    output_tokens: int = Field(..., ge=0)
    estimated_cost_usd: float = Field(..., ge=0.0)

    model_config = {"extra": "forbid"}


class GenerationMetadata(BaseModel):
    engine: MessageEngine
    model_version: str = Field(..., min_length=1)
    prompt_template_id: str = Field(..., min_length=1)
    generated_at: datetime
    token_usage: TokenUsage
    generation_attempt: int = Field(..., ge=1)
    diversity_signature: str = Field(..., min_length=1)

    model_config = {"extra": "forbid"}


class LayerFailure(BaseModel):
    layer: PersonalizationLayerName
    reason: str = Field(..., min_length=1)

    model_config = {"extra": "forbid"}


class ValidationStateBlock(BaseModel):
    traceability: TraceabilityState
    traceability_failures: List[LayerFailure] = Field(default_factory=list)
    diversity: DiversityState
    diversity_collision_with: List[UUID] = Field(default_factory=list)
    freshness: FreshnessState
    freshness_failures: List[LayerFailure] = Field(default_factory=list)

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def failures_match_state(self) -> "ValidationStateBlock":
        if self.traceability == TraceabilityState.PASSED and self.traceability_failures:
            raise ValueError("traceability=PASSED requires empty traceability_failures")
        if self.traceability != TraceabilityState.PASSED and not self.traceability_failures:
            raise ValueError("traceability SOFT_FAIL/HARD_FAIL requires non-empty traceability_failures")
        if self.diversity == DiversityState.FAILED and not self.diversity_collision_with:
            raise ValueError("diversity=FAILED requires non-empty diversity_collision_with")
        if self.diversity != DiversityState.FAILED and self.diversity_collision_with:
            raise ValueError("diversity_collision_with must be empty unless diversity=FAILED")
        if self.freshness == FreshnessState.PASSED and self.freshness_failures:
            raise ValueError("freshness=PASSED requires empty freshness_failures")
        if self.freshness == FreshnessState.FAILED and not self.freshness_failures:
            raise ValueError("freshness=FAILED requires non-empty freshness_failures")
        return self


class OperatorEdit(BaseModel):
    edited_at: datetime
    edited_by: str = Field(..., min_length=1)
    before: str
    after: str
    reason: str

    model_config = {"extra": "forbid"}


class Message(BaseModel):
    message_id: UUID
    client_id: UUID
    account_domain: str = Field(..., min_length=1)
    contact_id: Optional[UUID] = Field(
        ...,
        description="Null only for REDDIT_STRATEGY_NOTE (account-level brief).",
    )
    tier: AccountTier
    channel: MessageChannel
    sequence_position: int = Field(..., ge=0)
    subject: Optional[str] = Field(..., description="Required for EMAIL; null otherwise.")
    body: str = Field(..., min_length=1)
    personalization_layers: PersonalizationLayers
    generation_metadata: GenerationMetadata
    validation_state: ValidationStateBlock
    review_state: MessageReviewState
    operator_edit_history: List[OperatorEdit] = Field(default_factory=list)
    last_updated_at: datetime

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_message(self) -> "Message":
        # Subject required for EMAIL, forbidden otherwise.
        if self.channel == MessageChannel.EMAIL and not self.subject:
            raise ValueError("EMAIL channel requires a non-empty subject")
        if self.channel != MessageChannel.EMAIL and self.subject is not None:
            raise ValueError(f"subject must be null for channel {self.channel.value}")
        # Reddit strategy notes are account-level (no contact_id); all other channels need one.
        if self.channel == MessageChannel.REDDIT_STRATEGY_NOTE and self.contact_id is not None:
            raise ValueError("REDDIT_STRATEGY_NOTE is account-level; contact_id must be null")
        if self.channel != MessageChannel.REDDIT_STRATEGY_NOTE and self.contact_id is None:
            raise ValueError(f"channel {self.channel.value} requires contact_id")
        # Tier-aware traceability invariant (the central Phase 4 rule).
        layers = self.personalization_layers
        any_untraced = any(
            getattr(layers, name).untraced
            for name in ("account_hook", "buyer_hook", "pain", "value")
        )
        trace = self.validation_state.traceability
        if any_untraced:
            if self.tier == AccountTier.TIER_1 and trace != TraceabilityState.HARD_FAIL:
                raise ValueError(
                    "Tier 1 message with any untraced layer must have traceability=HARD_FAIL"
                )
            if self.tier in (AccountTier.TIER_2, AccountTier.TIER_3) and trace != TraceabilityState.SOFT_FAIL:
                raise ValueError(
                    f"Tier 2/3 message with any untraced layer must have traceability=SOFT_FAIL "
                    f"(got {trace.value})"
                )
        else:
            if trace != TraceabilityState.PASSED:
                raise ValueError(
                    f"Message with all layers traced must have traceability=PASSED (got {trace.value})"
                )
        return self


class ByAccountSummary(BaseModel):
    contact_count: int = Field(..., ge=0)
    message_count: int = Field(..., ge=0)
    all_validated: bool
    all_approved: bool

    model_config = {"extra": "forbid"}


class MessagesByChannel(BaseModel):
    linkedin_connection: int = Field(..., ge=0)
    linkedin_dm: int = Field(..., ge=0)
    email: int = Field(..., ge=0)
    whatsapp: int = Field(..., ge=0)
    reddit_strategy_note: int = Field(..., ge=0)

    model_config = {"extra": "forbid"}


class MessagesByTier(BaseModel):
    tier_1: int = Field(..., ge=0)
    tier_2: int = Field(..., ge=0)
    tier_3: int = Field(..., ge=0)

    model_config = {"extra": "forbid"}


class MessagingAggregate(BaseModel):
    total_messages: int = Field(..., ge=0)
    by_channel: MessagesByChannel
    by_tier: MessagesByTier
    traceability_pass_rate: float = Field(..., ge=0.0, le=1.0)
    diversity_pass_rate: float = Field(..., ge=0.0, le=1.0)
    hard_failures: int = Field(..., ge=0)
    soft_failures: int = Field(..., ge=0)

    model_config = {"extra": "forbid"}


class GenerationCosts(BaseModel):
    claude_total_usd: float = Field(..., ge=0.0)
    gpt_total_usd: float = Field(..., ge=0.0)
    total_usd: float = Field(..., ge=0.0)
    avg_per_message_usd: float = Field(..., ge=0.0)

    model_config = {"extra": "forbid"}


class MessagingPackage(BaseModel):
    client_id: UUID
    generated_at: datetime
    messages: List[Message]
    by_account: dict[str, ByAccountSummary]
    aggregate: MessagingAggregate
    generation_costs: GenerationCosts

    model_config = {"extra": "forbid"}


# ----- Prompt Template -----

class PromptTemplate(BaseModel):
    template_id: str = Field(..., min_length=1)
    channel: MessageChannel
    tier_target: TierTarget
    sequence_position: int = Field(..., ge=0)
    engine_target: MessageEngineTarget
    system_prompt: str = Field(..., min_length=1)
    user_prompt_template: str = Field(..., min_length=1)
    max_tokens: int = Field(..., ge=1)
    temperature: float = Field(..., ge=0.0, le=2.0)
    active: bool
    version: str = Field(..., pattern=r"^\d+\.\d+\.\d+$")
    created_at: datetime
    deprecated_at: Optional[datetime] = None

    model_config = {"extra": "forbid"}


# ----- CP3 Review State -----

class CP3Status(str, Enum):
    NOT_STARTED = "NOT_STARTED"
    OPERATOR_REVIEW = "OPERATOR_REVIEW"
    CLIENT_REVIEW = "CLIENT_REVIEW"
    CHANGES_REQUESTED = "CHANGES_REQUESTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class MessageReviewDecision(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    EDITED = "EDITED"
    REGENERATED = "REGENERATED"
    REJECTED = "REJECTED"


class BuyerDecision(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    NEEDS_REVISION = "NEEDS_REVISION"
    REMOVED = "REMOVED"


class FeedbackSentiment(str, Enum):
    POSITIVE = "POSITIVE"
    NEUTRAL = "NEUTRAL"
    NEGATIVE = "NEGATIVE"
    CHANGE_REQUEST = "CHANGE_REQUEST"


class OperatorMessageEditLayer(str, Enum):
    ACCOUNT_HOOK = "account_hook"
    BUYER_HOOK = "buyer_hook"
    PAIN = "pain"
    VALUE = "value"
    SUBJECT = "subject"
    BODY = "body"


class OperatorMessageEdit(BaseModel):
    layer: OperatorMessageEditLayer
    before: str
    after: str
    edited_at: datetime

    model_config = {"extra": "forbid"}


class MessageReview(BaseModel):
    message_id: UUID
    review_decision: MessageReviewDecision
    operator_edits: List[OperatorMessageEdit] = Field(default_factory=list)
    review_notes: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    opened_count: int = Field(0, ge=0)

    model_config = {"extra": "forbid"}


class BuyerApprovalCP3(BaseModel):
    contact_id: UUID
    account_domain: str = Field(..., min_length=1)
    all_messages_reviewed: bool
    buyer_decision: BuyerDecision
    buyer_notes: Optional[str] = None

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def approval_requires_review(self) -> "BuyerApprovalCP3":
        if self.buyer_decision == BuyerDecision.APPROVED and not self.all_messages_reviewed:
            raise ValueError(
                "BuyerApproval=APPROVED requires all_messages_reviewed=true"
            )
        return self


class ClientFeedback(BaseModel):
    feedback_id: UUID
    message_id: Optional[UUID] = Field(
        ..., description="Null = general feedback, not tied to a specific message"
    )
    feedback_text: str = Field(..., min_length=1)
    sentiment: FeedbackSentiment
    resolved: bool
    resolved_by: Optional[str] = None
    resolution_notes: Optional[str] = None
    submitted_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def resolution_consistency(self) -> "ClientFeedback":
        if self.resolved:
            if not self.resolved_by:
                raise ValueError("resolved=true requires resolved_by")
            if self.resolved_at is None:
                raise ValueError("resolved=true requires resolved_at")
        else:
            if self.resolved_by is not None:
                raise ValueError("resolved_by must be null when resolved=false")
            if self.resolved_at is not None:
                raise ValueError("resolved_at must be null when resolved=false")
        return self


class CP3AggregateProgress(BaseModel):
    total_messages: int = Field(..., ge=0)
    reviewed_messages: int = Field(..., ge=0)
    approved_messages: int = Field(..., ge=0)
    edited_messages: int = Field(..., ge=0)
    regenerated_messages: int = Field(..., ge=0)
    total_buyers: int = Field(..., ge=0)
    approved_buyers: int = Field(..., ge=0)
    client_feedback_total: int = Field(..., ge=0)
    client_feedback_unresolved: int = Field(..., ge=0)

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_counts(self) -> "CP3AggregateProgress":
        if self.reviewed_messages > self.total_messages:
            raise ValueError("reviewed_messages cannot exceed total_messages")
        if self.approved_buyers > self.total_buyers:
            raise ValueError("approved_buyers cannot exceed total_buyers")
        if self.client_feedback_unresolved > self.client_feedback_total:
            raise ValueError("client_feedback_unresolved cannot exceed client_feedback_total")
        return self


class CP3Blocker(BaseModel):
    type: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)

    model_config = {"extra": "forbid"}


class CP3ReviewState(BaseModel):
    client_id: UUID
    status: CP3Status
    opened_at: Optional[datetime]
    operator_completed_at: Optional[datetime]
    client_share_sent_at: Optional[datetime]
    client_completed_at: Optional[datetime]
    approved_at: Optional[datetime]
    reviewer: str
    client_share_token: Optional[UUID]
    client_share_email: Optional[str]
    client_review_sample_ids: List[UUID] = Field(default_factory=list)
    message_reviews: List[MessageReview] = Field(default_factory=list)
    buyer_approvals: List[BuyerApprovalCP3] = Field(default_factory=list)
    client_feedback: List[ClientFeedback] = Field(default_factory=list)
    aggregate_progress: CP3AggregateProgress
    blockers: List[CP3Blocker] = Field(default_factory=list)

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_state(self) -> "CP3ReviewState":
        if self.status == CP3Status.NOT_STARTED and self.opened_at is not None:
            raise ValueError("opened_at must be null when status is NOT_STARTED")
        if self.status == CP3Status.APPROVED:
            if self.approved_at is None:
                raise ValueError("APPROVED status requires approved_at timestamp")
            if self.aggregate_progress.reviewed_messages != self.aggregate_progress.total_messages:
                raise ValueError(
                    "CP3 cannot be APPROVED until reviewed_messages == total_messages"
                )
            if self.aggregate_progress.client_feedback_unresolved != 0:
                raise ValueError(
                    "CP3 cannot be APPROVED while client feedback is unresolved"
                )
            if any(
                b.buyer_decision == BuyerDecision.PENDING
                for b in self.buyer_approvals
            ):
                raise ValueError("CP3 cannot be APPROVED while any buyer is PENDING")
        elif self.approved_at is not None:
            raise ValueError("approved_at must be null unless status is APPROVED")
        if self.aggregate_progress.total_messages != len(self.message_reviews):
            raise ValueError("total_messages must equal message_reviews length")
        if self.aggregate_progress.total_buyers != len(self.buyer_approvals):
            raise ValueError("total_buyers must equal buyer_approvals length")
        if self.aggregate_progress.client_feedback_total != len(self.client_feedback):
            raise ValueError("client_feedback_total must equal client_feedback length")
        unresolved = sum(1 for f in self.client_feedback if not f.resolved)
        if self.aggregate_progress.client_feedback_unresolved != unresolved:
            raise ValueError(
                "client_feedback_unresolved must match the actual count of unresolved client_feedback items"
            )
        return self


# Phase 4 compatibility aliases. Earlier phases already use `Channel` and
# `BuyerApproval`, so the concrete Phase 4 names remain `MessageChannel` and
# `BuyerApprovalCP3`; these aliases cover prompt-pack terminology where it does
# not collide with Phase 1-3 models.
SourceType = MessageSourceType
ReviewState = MessageReviewState
ValidationState = TraceabilityState
CP3BuyerApproval = BuyerApprovalCP3


# ---------------------------------------------------------------------------
# Phase 5 / Checkpoint 4 — Sales Handoff
# ---------------------------------------------------------------------------

class CP4Status(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    ESCALATED = "ESCALATED"


class HandoffTriggerEventType(str, Enum):
    EMAIL_REPLY = "EMAIL_REPLY"
    LINKEDIN_DM_REPLY = "LINKEDIN_DM_REPLY"
    WHATSAPP_REPLY = "WHATSAPP_REPLY"
    MEETING_BOOKED = "MEETING_BOOKED"


class HandoffTriggerEvent(BaseModel):
    event_type: HandoffTriggerEventType = Field(..., description="Engagement event that contributed to crossing the >=60 score threshold.")
    occurred_at: datetime = Field(..., description="When the engagement event was received from the transport webhook.")
    score_delta: int = Field(..., ge=1, description="Points this event contributed to the account engagement score.")

    model_config = {"extra": "forbid"}


class SalesHandoffNote(BaseModel):
    """
    Checkpoint 4 record. The Phase 5 Campaign agent creates this when
    engagement_score >= 60. The Sales Exec must ACCEPT/REJECT within 24h
    of notify_sent_at or the handoff auto-escalates to the Operator.
    """

    handoff_id: UUID = Field(..., description="Stable identifier.")
    client_id: UUID = Field(..., description="Owning ABM client.")
    account_domain: str = Field(..., min_length=1, description="Account this handoff is for.")
    contact_id: UUID = Field(..., description="Primary contact whose engagement crossed the threshold.")
    tldr_text: str = Field(..., min_length=1, description="Sales-Exec-ready TL;DR (handoff_generator output).")
    engagement_score: int = Field(..., ge=0, description="Account engagement score at handoff creation.")
    triggering_events: List[HandoffTriggerEvent] = Field(..., min_length=1, description="Events that drove the score to >=60.")
    status: CP4Status = Field(..., description="Lifecycle state.")
    created_at: datetime = Field(..., description="When the handoff was created.")
    notify_sent_at: Optional[datetime] = Field(None, description="When Sales Exec was first notified. Set once; never overwritten (idempotency).")
    accepted_at: Optional[datetime] = Field(None, description="When the Sales Exec accepted.")
    accepted_by: Optional[str] = Field(None, min_length=1, description="Sales Exec identity who accepted.")
    escalated_at: Optional[datetime] = Field(None, description="When the 24h SLA breach escalated to Operator.")
    escalation_reason: Optional[str] = Field(None, description="Why the handoff was escalated.")
    rejected_at: Optional[datetime] = Field(None, description="When the Sales Exec rejected.")
    rejection_reason: Optional[str] = Field(None, description="Why the Sales Exec rejected.")

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_state(self) -> "SalesHandoffNote":
        if self.status == CP4Status.ACCEPTED:
            if self.accepted_at is None or self.accepted_by is None:
                raise ValueError("ACCEPTED status requires accepted_at and accepted_by")
            if self.rejected_at is not None or self.escalated_at is not None:
                raise ValueError("ACCEPTED handoff cannot also carry rejected_at or escalated_at")
        elif self.accepted_at is not None or self.accepted_by is not None:
            raise ValueError("accepted_at/accepted_by must be null unless status is ACCEPTED")

        if self.status == CP4Status.REJECTED:
            if self.rejected_at is None or not self.rejection_reason:
                raise ValueError("REJECTED status requires rejected_at and rejection_reason")
            if self.accepted_at is not None or self.escalated_at is not None:
                raise ValueError("REJECTED handoff cannot also carry accepted_at or escalated_at")
        elif self.rejected_at is not None or self.rejection_reason is not None:
            raise ValueError("rejected_at/rejection_reason must be null unless status is REJECTED")

        if self.status == CP4Status.ESCALATED:
            if self.escalated_at is None or not self.escalation_reason:
                raise ValueError("ESCALATED status requires escalated_at and escalation_reason")
            if self.notify_sent_at is None:
                raise ValueError("ESCALATED is only reachable after notify_sent_at was set")
            if self.accepted_at is not None or self.rejected_at is not None:
                raise ValueError("ESCALATED handoff cannot also carry accepted_at or rejected_at")
        elif self.escalated_at is not None or self.escalation_reason is not None:
            raise ValueError("escalated_at/escalation_reason must be null unless status is ESCALATED")

        return self


class TransportName(str, Enum):
    INSTANTLY = "INSTANTLY"
    PHANTOMBUSTER = "PHANTOMBUSTER"
    TWILIO = "TWILIO"
    OPERATOR_BRIEF = "OPERATOR_BRIEF"


class SendStatus(str, Enum):
    QUEUED = "QUEUED"
    SENT = "SENT"
    FAILED = "FAILED"
    PENDING_QUOTA_RESET = "PENDING_QUOTA_RESET"
    PENDING_COOKIE_REFRESH = "PENDING_COOKIE_REFRESH"
    PENDING_BUDGET = "PENDING_BUDGET"
    HALTED = "HALTED"


class CampaignRunStatus(str, Enum):
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    HALTED = "HALTED"
    FAILED = "FAILED"


class HaltReason(str, Enum):
    BOUNCE_CIRCUIT_BREAKER = "BOUNCE_CIRCUIT_BREAKER"
    TRANSPORT_AUTH_FAILURE = "TRANSPORT_AUTH_FAILURE"
    OPERATOR_REQUESTED = "OPERATOR_REQUESTED"
    GLOBAL_HALT = "GLOBAL_HALT"


class HaltScope(str, Enum):
    CLIENT = "CLIENT"
    GLOBAL = "GLOBAL"


class EngagementEventType(str, Enum):
    EMAIL_OPEN = "EMAIL_OPEN"
    EMAIL_REPLY = "EMAIL_REPLY"
    EMAIL_BOUNCE = "EMAIL_BOUNCE"
    EMAIL_UNSUBSCRIBE = "EMAIL_UNSUBSCRIBE"
    LINKEDIN_DM_REPLY = "LINKEDIN_DM_REPLY"
    LINKEDIN_CONNECTION_ACCEPTED = "LINKEDIN_CONNECTION_ACCEPTED"
    WHATSAPP_REPLY = "WHATSAPP_REPLY"
    MEETING_BOOKED = "MEETING_BOOKED"
    REPLY_NEGATIVE = "REPLY_NEGATIVE"


class EngagementChannel(str, Enum):
    EMAIL = "EMAIL"
    LINKEDIN_DM = "LINKEDIN_DM"
    LINKEDIN_CONNECTION = "LINKEDIN_CONNECTION"
    WHATSAPP = "WHATSAPP"


class WebhookProvider(str, Enum):
    INSTANTLY = "INSTANTLY"
    PHANTOMBUSTER = "PHANTOMBUSTER"
    TWILIO = "TWILIO"
    CALCOM = "CALCOM"
    INTERNAL = "INTERNAL"


class OutboundSend(BaseModel):
    send_id: UUID
    client_id: UUID
    message_id: UUID
    account_domain: str = Field(..., min_length=1)
    contact_id: Optional[UUID]
    channel: MessageChannel
    transport: TransportName
    status: SendStatus
    provider_message_id: Optional[str]
    error_code: Optional[str]
    error_message: Optional[str]
    attempted_at: datetime
    completed_at: Optional[datetime]

    model_config = {"extra": "forbid"}


class EngagementEvent(BaseModel):
    event_id: UUID
    client_id: UUID
    account_domain: str = Field(..., min_length=1)
    contact_id: Optional[UUID]
    channel: EngagementChannel
    event_type: EngagementEventType
    score_delta: int
    occurred_at: datetime
    provider: WebhookProvider
    provider_event_id: str = Field(..., min_length=1)
    raw_payload: dict = Field(default_factory=dict)

    model_config = {"extra": "forbid"}


class CampaignRun(BaseModel):
    run_id: UUID
    client_id: UUID
    started_at: datetime
    finished_at: Optional[datetime]
    status: CampaignRunStatus
    total_messages: int = Field(..., ge=0)
    total_sent: int = Field(..., ge=0)
    total_failed: int = Field(..., ge=0)
    total_pending: int = Field(..., ge=0)
    halted: bool
    halt_reason: Optional[str]
    quota_warnings: List[dict] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class CampaignHalt(BaseModel):
    halt_id: UUID
    client_id: Optional[UUID] = Field(None, description="Null when scope=GLOBAL")
    scope: HaltScope
    reason: HaltReason
    detail: str
    triggered_at: datetime
    triggered_by: str
    resumed_at: Optional[datetime] = None
    resumed_by: Optional[str] = None
    is_active: bool

    model_config = {"extra": "forbid"}


class CP4HandoffSummary(BaseModel):
    """Aggregate snapshot for the operator dashboard."""

    total: int = Field(..., ge=0)
    pending: int = Field(..., ge=0)
    accepted: int = Field(..., ge=0)
    rejected: int = Field(..., ge=0)
    escalated: int = Field(..., ge=0)
    overdue_pending: int = Field(..., ge=0, description="PENDING handoffs whose 24h SLA has elapsed but not yet swept.")

    model_config = {"extra": "forbid"}
