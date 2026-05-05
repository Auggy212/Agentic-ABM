// Stub types for Checkpoint4 — full implementation TBD
export interface SalesHandoffNote {
  handoff_id: string;
  client_id: string;
  account_domain: string;
  contact_id: string;
  engagement_score: number;
  status: "pending" | "accepted" | "rejected" | "overdue";
  created_at: string;
  tldr_text?: string;
  sales_rep?: string;
  accepted_at?: string;
  rejected_at?: string;
  override_reason?: string;
}

export interface CP4HandoffSummary {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  overdue: number;
}

export interface CP4QueuePayload {
  handoffs: SalesHandoffNote[];
  summary: CP4HandoffSummary;
  generated_at: string;
}
