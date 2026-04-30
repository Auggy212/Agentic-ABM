export type EmailFinalStatus = "VALID" | "INVALID" | "CATCH_ALL" | "RISKY" | "NOT_FOUND";
export type EngineName = "NEVERBOUNCE" | "ZEROBOUNCE";
export type ResolutionMethod =
  | "LINKEDIN_PRIMARY"
  | "APOLLO_FALLBACK"
  | "NO_RECONCILIATION_POSSIBLE";
export type IssueSeverity = "ERROR" | "WARNING" | "INFO";
export type VerificationSource = "apollo" | "hunter" | "clay" | "linkedin_manual";

export interface EmailEngineResult {
  status: EmailFinalStatus;
  confidence: number;
  sub_status: string | null;
  checked_at: string;
}

export interface EmailVerification {
  email: string;
  status: EmailFinalStatus;
  primary_engine: EngineName;
  secondary_engine: "ZEROBOUNCE" | null;
  primary_result: EmailEngineResult;
  secondary_result: EmailEngineResult | null;
  relookup_attempted: boolean;
  relookup_source: "HUNTER" | null;
  relookup_email: string | null;
  relookup_blocked_reason: "QUOTA_EXHAUSTED" | "NO_MATCH" | null;
  final_status: EmailFinalStatus;
}

export interface LinkedinCheck {
  url: string | null;
  reachable: boolean;
  http_status: number | null;
  check_authoritative: boolean;
  checked_at: string;
}

export interface WebsiteCheck {
  domain: string;
  reachable: boolean;
  http_status: number | null;
  checked_at: string;
}

export interface TitleReconciliation {
  apollo_title: string;
  linkedin_title: string | null;
  resolved_title: string;
  resolution_method: ResolutionMethod;
  mismatch_resolved: boolean;
}

export interface JobChangeVerification {
  apollo_claimed: boolean;
  linkedin_confirmed: boolean | null;
  verified: boolean;
  confidence: number;
}

export interface VerificationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
}

export interface VerificationResult {
  contact_id: string;
  account_domain: string;
  email_verification: EmailVerification;
  linkedin_check: LinkedinCheck;
  website_check: WebsiteCheck;
  title_reconciliation: TitleReconciliation;
  job_change_verification: JobChangeVerification;
  overall_data_quality_score: number;
  issues: VerificationIssue[];
  verified_at: string;
  display_name?: string;
  committee_role?: string;
  source?: VerificationSource;
}

export interface SourceBreakdown {
  total: number;
  valid: number;
  invalid: number;
  pass_rate: number;
}

export interface PerSourceBreakdown {
  apollo: SourceBreakdown;
  hunter: SourceBreakdown;
  clay: SourceBreakdown | null;
  linkedin_manual: SourceBreakdown | null;
}

export interface VerificationAggregate {
  total_contacts: number;
  valid_emails: number;
  invalid_emails: number;
  catch_all: number;
  risky: number;
  not_found: number;
  deliverability_rate: number;
  linkedin_reachable_rate: number;
  linkedin_authoritative_rate: number;
  website_reachable_rate: number;
  title_mismatches_resolved: number;
  job_changes_verified: number;
}

export interface QuotaUsage {
  neverbounce_used_this_run: number;
  zerobounce_used_this_run: number;
  hunter_used_this_run: number;
  neverbounce_remaining: number;
  zerobounce_remaining: number;
  hunter_remaining: number;
}

export interface VerifiedDataPackage {
  client_id: string;
  generated_at: string;
  verifications: VerificationResult[];
  per_source_breakdown: PerSourceBreakdown;
  aggregate: VerificationAggregate;
  quota_usage: QuotaUsage;
  meets_deliverability_target: boolean;
  target_miss_diagnosis: string | null;
}
