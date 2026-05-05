// Stub types for Checkpoint2 — full implementation TBD
export interface InferredClaimReview {
  claim_id: string;
  account_domain: string;
  field: string;
  inferred_value: string;
  confidence: number;
  decision?: ReviewDecision;
  operator_note?: string;
}

export type ReviewDecision = "APPROVED" | "REJECTED" | "MODIFIED";

export interface CP2ReviewState {
  claims: InferredClaimReview[];
  total_claims: number;
  total_accounts: number;
  reviewed: number;
}

export interface CP2AuditRow {
  id: string;
  claim_id: string | null;
  account_domain: string | null;
  action: string;
  reviewer: string;
  before_state: unknown;
  after_state: unknown;
}

export interface CP2AggregateProgress {
  total_claims: number;
  reviewed: number;
  approved: number;
  rejected: number;
  modified: number;
}
