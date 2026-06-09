// External Sales Exec view of the CP4 SalesHandoffNote.
//
// Audience discipline (master prompt §1): no client_id, no run IDs, no
// validation badges, no costs, no model names. Only the fields below should
// ever be returned from /api/sales/handoff/{token}.

export type CP4Status = "PENDING" | "ACCEPTED" | "REJECTED" | "ESCALATED";

export type HandoffTriggerEventType =
  | "EMAIL_REPLY"
  | "LINKEDIN_DM_REPLY"
  | "WHATSAPP_REPLY"
  | "MEETING_BOOKED";

export interface HandoffTriggerEvent {
  event_type: HandoffTriggerEventType;
  occurred_at: string; // ISO
  score_delta: number;
}

export interface SalesHandoffPublic {
  handoff_id: string;
  account_display_name: string;   // Friendly company name; not the raw domain.
  contact_display_name: string;   // Champion's name; not the contact_id.
  contact_title: string | null;
  tldr_text: string;              // Generator output.
  triggering_events: HandoffTriggerEvent[];
  meeting_link: string | null;    // Cal.com or similar; null if not yet provided.
  status: CP4Status;
  created_at: string;
  notify_sent_at: string | null;  // SLA countdown anchor.
  sla_hours: number;              // 24 today; surfaced so UI logic doesn't hard-code it.
  accepted_at: string | null;
  accepted_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}
