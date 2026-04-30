// Mirrors backend/schemas/cp2_review_state.schema.json. Hand-maintained — keep in sync.

export type CP2Status = "NOT_STARTED" | "IN_REVIEW" | "APPROVED" | "REJECTED";

export type ClaimSourceType =
  | "BUYER_PAIN_POINT"
  | "INTEL_REPORT_PRIORITY"
  | "INTEL_REPORT_COMPETITOR"
  | "INTEL_REPORT_PAIN"
  | "INTEL_REPORT_OTHER";

export type ReviewDecision = "PENDING" | "APPROVED" | "CORRECTED" | "REMOVED";

export type AccountDecision =
  | "PENDING"
  | "APPROVED"
  | "NEEDS_REVISION"
  | "REMOVED_FROM_PIPELINE";

export type CP2BlockerType =
  | "UNREVIEWED_CLAIMS"
  | "UNAPPROVED_ACCOUNTS"
  | "MISSING_REVIEWER";

export interface CP2Blocker {
  type: CP2BlockerType;
  message: string;
}

export interface InferredClaimReview {
  claim_id: string;
  source_type: ClaimSourceType;
  account_domain: string;
  contact_id: string | null;
  claim_text: string;
  evidence_status: "INFERRED";
  reasoning: string;
  review_decision: ReviewDecision;
  corrected_text: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
}

export interface AccountApproval {
  account_domain: string;
  buyer_profiles_approved: boolean;
  intel_report_approved: boolean | null;
  account_decision: AccountDecision;
  account_notes: string | null;
}

export interface CP2AggregateProgress {
  total_inferred_claims: number;
  reviewed_claims: number;
  approved_claims: number;
  corrected_claims: number;
  removed_claims: number;
  total_accounts: number;
  approved_accounts: number;
  removed_accounts: number;
}

export interface CP2ReviewState {
  client_id: string;
  status: CP2Status;
  opened_at: string | null;
  approved_at: string | null;
  reviewer: string;
  reviewer_notes: string | null;
  inferred_claims_review: InferredClaimReview[];
  account_approvals: AccountApproval[];
  aggregate_progress: CP2AggregateProgress;
  blockers: CP2Blocker[];
}

export interface CP2AuditRow {
  id: string;
  claim_id: string | null;
  account_domain: string | null;
  action: string;
  reviewer: string;
  before_state: unknown;
  after_state: unknown;
  timestamp: string | null;
}

export const SOURCE_TYPE_LABELS: Record<ClaimSourceType, string> = {
  BUYER_PAIN_POINT: "Buyer Pain Points",
  INTEL_REPORT_PRIORITY: "Intel Report — Strategic Priorities",
  INTEL_REPORT_COMPETITOR: "Intel Report — Competitive Landscape",
  INTEL_REPORT_PAIN: "Intel Report — Inferred Pain Points",
  INTEL_REPORT_OTHER: "Intel Report — Other",
};
