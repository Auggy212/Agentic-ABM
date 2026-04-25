export type AccountTier = "TIER_1" | "TIER_2" | "TIER_3";
export type DataSource = "APOLLO" | "HARMONIC" | "CRUNCHBASE" | "BUILTWITH" | "CLIENT_UPLOAD";
export type RunStatus = "needs_review" | "approved" | "running" | "complete";

export interface FundingRound {
  round: string;
  amount_usd: number | "not_found";
  date: string;
}

export interface AccountSignal {
  type: string;
  description: string;
  date: string;
  source_url: string;
}

export interface ScoreBreakdown {
  industry: number;
  company_size: number;
  geography: number;
  tech_stack: number;
  funding_stage: number;
  buying_triggers: number;
}

export interface AccountRecord {
  id: string;
  domain: string;
  company_name: string;
  website: string;
  linkedin_url: string | null;
  industry: string;
  headcount: number | "not_found";
  estimated_arr: string;
  funding_stage: string;
  last_funding_round: FundingRound;
  hq_location: string;
  technologies_used: string[];
  recent_signals: AccountSignal[];
  icp_score: number;
  score_breakdown: ScoreBreakdown;
  tier: AccountTier;
  source: DataSource;
  enriched_at: string;
}

export interface TierBreakdown {
  tier_1: number;
  tier_2: number;
  tier_3: number;
}

export interface AccountsListMeta {
  total_found: number;
  tier_breakdown: TierBreakdown;
  generated_at: string;
  client_id: string;
  run_status?: RunStatus;
  quota_warnings?: string[];
  flagged_accounts?: number;
  phase_2_locked?: boolean;
  share_token?: string | null;
}

export interface AccountsListResponse {
  accounts: AccountRecord[];
  total: number;
  page: number;
  page_size: number;
  meta?: AccountsListMeta;
}

export interface AccountsFilters {
  tier: "ALL" | AccountTier;
  minScore: number;
  maxScore: number;
  search: string;
  sources: DataSource[];
}

export interface RemoveAccountPayload {
  id: string;
  reason: string;
}

export interface RemoveAccountResult {
  account_id: string;
  status: "removed";
  reason: string | null;
}

export interface CheckpointApprovalResponse {
  checkpoint: number;
  status: "approved";
  approved_at: string;
  stubbed?: boolean;
}
