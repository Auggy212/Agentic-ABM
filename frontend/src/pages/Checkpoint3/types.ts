export type CP3Status =
  | "NOT_STARTED"
  | "OPERATOR_REVIEW"
  | "CLIENT_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "REJECTED";

export type MessageChannel =
  | "LINKEDIN_CONNECTION"
  | "LINKEDIN_DM"
  | "EMAIL"
  | "WHATSAPP"
  | "REDDIT_STRATEGY_NOTE";

export type Tier = "TIER_1" | "TIER_2" | "TIER_3";
export type TraceabilityState = "PASSED" | "SOFT_FAIL" | "HARD_FAIL";
export type DiversityState = "PASSED" | "FAILED" | "SKIPPED";
export type FreshnessState = "PASSED" | "FAILED";
export type MessageReviewDecision = "PENDING" | "APPROVED" | "EDITED" | "REGENERATED" | "REJECTED";
export type BuyerDecision = "PENDING" | "APPROVED" | "NEEDS_REVISION" | "REMOVED";
export type FeedbackSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "CHANGE_REQUEST";

export interface PersonalizationLayer {
  text: string;
  source_claim_id: string | null;
  source_type: string;
  untraced: boolean;
  claim_text?: string;
}

export interface Message {
  message_id: string;
  client_id: string;
  account_domain: string;
  account_company?: string;
  contact_id: string | null;
  contact_name?: string;
  contact_title?: string;
  contact_committee_role?: string;
  tier: Tier;
  channel: MessageChannel;
  sequence_position: number;
  subject: string | null;
  body: string;
  personalization_layers: {
    account_hook: PersonalizationLayer;
    buyer_hook: PersonalizationLayer;
    pain: PersonalizationLayer;
    value: PersonalizationLayer;
  };
  generation_metadata?: {
    engine: string;
    model_version: string;
    prompt_template_id: string;
    generated_at: string;
    token_usage: { input_tokens: number; output_tokens: number; estimated_cost_usd: number };
    generation_attempt: number;
    diversity_signature: string;
  };
  validation_state: {
    traceability: TraceabilityState;
    traceability_failures: { layer: string; reason: string }[];
    diversity: DiversityState;
    diversity_collision_with: string[];
    freshness: FreshnessState;
    freshness_failures: { layer: string; reason: string }[];
  };
  review_state: string;
  operator_edit_history?: unknown[];
  last_updated_at: string;
}

export interface MessageReview {
  message_id: string;
  review_decision: MessageReviewDecision;
  operator_edits: { layer: string; before: string; after: string; edited_at: string }[];
  review_notes: string | null;
  reviewed_at: string | null;
  opened_count: number;
}

export interface BuyerApproval {
  contact_id: string;
  account_domain: string;
  all_messages_reviewed: boolean;
  buyer_decision: BuyerDecision;
  buyer_notes: string | null;
}

export interface ClientFeedback {
  feedback_id: string;
  message_id: string | null;
  feedback_text: string;
  sentiment: FeedbackSentiment;
  resolved: boolean;
  resolved_by: string | null;
  resolution_notes: string | null;
  submitted_at: string;
  resolved_at: string | null;
}

export interface CP3ReviewState {
  client_id: string;
  status: CP3Status;
  opened_at: string | null;
  operator_completed_at: string | null;
  client_share_sent_at: string | null;
  client_completed_at: string | null;
  approved_at: string | null;
  reviewer: string;
  client_share_token: string | null;
  client_share_email: string | null;
  client_review_sample_ids: string[];
  message_reviews: MessageReview[];
  buyer_approvals: BuyerApproval[];
  client_feedback: ClientFeedback[];
  aggregate_progress: {
    total_messages: number;
    reviewed_messages: number;
    approved_messages: number;
    edited_messages: number;
    regenerated_messages: number;
    total_buyers: number;
    approved_buyers: number;
    client_feedback_total: number;
    client_feedback_unresolved: number;
  };
  blockers: { type: string; message: string }[];
  messages?: Message[];
  share_url?: string;
}

export interface CP3Filters {
  channel: "ALL" | MessageChannel;
  tier: "ALL" | Tier;
  validation: "ALL" | "HARD_FAIL" | "SOFT_FAIL" | "DIVERSITY_COLLISION" | "ALL_PASS";
  reviewState: "ALL" | MessageReviewDecision;
  issuesOnly: boolean;
  contactId?: string | null;
}

export const CHANNEL_LABEL: Record<MessageChannel, string> = {
  LINKEDIN_CONNECTION: "LinkedIn Connection",
  LINKEDIN_DM: "LinkedIn DM",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  REDDIT_STRATEGY_NOTE: "Reddit Strategy",
};

export const DEFAULT_CP3_CLIENT_ID = "12345678-1234-5678-1234-567812345678";
