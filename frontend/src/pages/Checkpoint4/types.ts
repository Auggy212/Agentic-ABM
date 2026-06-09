// Internal Operator-facing CP4 types. Mirrors the backend SalesHandoffNote
// schema (backend/schemas/sales_handoff_note.schema.json). Includes every
// internal field — costs, handoff_id, escalation_reason, etc. (master prompt §1).

export type CP4Status = "PENDING" | "ACCEPTED" | "REJECTED" | "ESCALATED";

export type HandoffTriggerEventType =
  | "EMAIL_REPLY"
  | "LINKEDIN_DM_REPLY"
  | "WHATSAPP_REPLY"
  | "MEETING_BOOKED";

export interface HandoffTriggerEvent {
  event_type: HandoffTriggerEventType;
  occurred_at: string;
  score_delta: number;
}

export interface SalesHandoffNote {
  handoff_id: string;
  client_id: string;
  account_domain: string;
  contact_id: string;
  tldr_text: string;
  engagement_score: number;
  triggering_events: HandoffTriggerEvent[];
  status: CP4Status;
  created_at: string;
  notify_sent_at: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

export interface CP4HandoffSummary {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  escalated: number;
  overdue_pending: number;
}

export interface CP4QueuePayload {
  summary: CP4HandoffSummary;
  handoffs: SalesHandoffNote[];
}

export const SLA_HOURS = 24;
