export type CommitteeRole = "DECISION_MAKER" | "CHAMPION" | "BLOCKER" | "INFLUENCER";
export type EmailStatus = "VALID" | "UNVERIFIED" | "INVALID" | "CATCH_ALL" | "NOT_FOUND";
export type BuyerSource = "APOLLO" | "LUSHA" | "MANUAL";
export type Seniority =
  | "C_SUITE"
  | "VP"
  | "DIRECTOR"
  | "MANAGER"
  | "INDIVIDUAL_CONTRIBUTOR"
  | "UNKNOWN";

export interface InferredPainPoint {
  pain_point: string;
  reasoning: string;
  confidence: number;
  tag: "[INFERRED]";
}

export interface BuyerProfile {
  contact_id: string;
  account_domain: string;
  full_name: string;
  first_name: string;
  last_name: string;
  current_title: string;
  apollo_title: string;
  title_mismatch_flag: boolean;
  seniority: Seniority;
  department: string;
  email: string | null;
  email_status: EmailStatus;
  phone: string | null;
  linkedin_url: string | null;
  tenure_current_role_months: number | "not_found";
  tenure_current_company_months: number | "not_found";
  job_change_signal: boolean;
  committee_role: CommitteeRole;
  committee_role_confidence: number;
  committee_role_reasoning: string;
  inferred_pain_points: InferredPainPoint[];
  recent_activity: unknown[];
  source: BuyerSource;
  enriched_at: string;
  // operator edit fields
  _operator_edit_at?: string;
  _operator_note?: string;
  manual_override_reason?: string;
}

export interface BuyersByDomainResponse {
  domain: string;
  contacts: BuyerProfile[];
  total: number;
}

export interface BuyerIntelMeta {
  total_accounts_processed: number;
  total_contacts_found: number;
  contacts_per_account_avg: number;
  hunter_quota_used: number;
  apollo_quota_used: number;
  mismatches_flagged: number;
  quota_warnings: string[];
  pending_domains: string[];
  status: string;
}

export interface BuyersByClientResponse {
  client_id: string;
  generated_at: string | null;
  accounts: Record<string, BuyerProfile[]>;
  meta: BuyerIntelMeta;
}

export interface DiscoverRequest {
  client_id: string;
}

export interface DiscoverResponse {
  job_id: string;
  status: "queued";
  message: string;
}

export interface UpdateContactRoleRequest {
  committee_role: CommitteeRole;
  committee_role_reasoning?: string;
  note?: string;
}

export interface QuotaStatus {
  APOLLO_CONTACTS: { used: number; limit: number };
  HUNTER: { used: number; limit: number };
  LUSHA: { used: number; limit: number };
  NEVERBOUNCE?: { used: number; limit: number };
  ZEROBOUNCE?: { used: number; limit: number };
}
