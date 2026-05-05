// @ts-nocheck
import { MOCK_CP3_SHARE_TOKEN, mockCP3Messages, mockCP3State } from "./cp3";
import type { ClientFeedback, FeedbackSentiment } from "@/pages/Checkpoint3/types";

export interface ClientReviewPayload {
  client_id: string;
  client_company_name: string;
  client_logo_url?: string;
  operator_name: string;
  expires_at: string;
  status: string;
  messages: typeof mockCP3Messages;
  client_feedback: ClientFeedback[];
  aggregate_progress: {
    total_messages: number;
    reviewed_messages: number;
    client_feedback_total: number;
    client_feedback_unresolved: number;
  };
  submission_status: "open" | "signed";
}

let clientFeedback: ClientFeedback[] = [];
let approvedName: string | null = null;

export function getMockClientReview(token: string): ClientReviewPayload | null {
  if (token !== MOCK_CP3_SHARE_TOKEN) return null;
  return {
    client_id: mockCP3State.client_id,
    client_company_name: "Sennen",
    operator_name: "Maya Okafor",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: approvedName ? "APPROVED" : "CLIENT_REVIEW",
    messages: mockCP3Messages.slice(0, 5),
    client_feedback: clientFeedback,
    aggregate_progress: {
      total_messages: 274,
      reviewed_messages: 138,
      client_feedback_total: clientFeedback.length,
      client_feedback_unresolved: clientFeedback.filter((f) => !f.resolved).length,
    },
    submission_status: approvedName ? "signed" : "open",
  };
}

export function submitMockClientFeedback(messageId: string | null, text: string, sentiment: FeedbackSentiment) {
  const feedback: ClientFeedback = {
    feedback_id: `client-feedback-${Date.now()}`,
    message_id: messageId,
    feedback_text: text,
    sentiment,
    resolved: false,
    resolved_by: null,
    resolution_notes: null,
    submitted_at: new Date().toISOString(),
    resolved_at: null,
  };
  clientFeedback = [...clientFeedback, feedback];
  return feedback;
}

export function approveMockClientReview(name: string) {
  approvedName = name;
  return getMockClientReview(MOCK_CP3_SHARE_TOKEN);
}
