// Stub types for Checkpoint3 — full implementation TBD
export type MessageChannel = "email" | "linkedin_dm" | "whatsapp" | "call_script";
export type MessageReviewDecision = "APPROVED" | "REJECTED" | "MODIFIED";
export type FeedbackSentiment = "positive" | "neutral" | "negative";
export type Tier = "T1" | "T2" | "T3";

export interface Message {
  message_id: string;
  channel: MessageChannel;
  subject?: string;
  body: string;
  cta?: string;
  contact_id: string;
  account_domain: string;
  day_number?: number;
}

export interface MessageReview {
  message_id: string;
  decision?: MessageReviewDecision;
  operator_note?: string;
  reviewed_at?: string;
}

export interface BuyerApproval {
  buyer_id: string;
  approved: boolean;
  operator_note?: string;
}

export interface ClientFeedback {
  feedback_id: string;
  message_id: string;
  sentiment: FeedbackSentiment;
  comment?: string;
  submitted_at: string;
}

export interface CP3ReviewState {
  messages: Message[];
  reviews: MessageReview[];
  buyer_approvals: BuyerApproval[];
  client_feedback: ClientFeedback[];
  status: string;
}
