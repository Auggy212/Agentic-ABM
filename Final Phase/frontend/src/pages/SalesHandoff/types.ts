// Stub types for SalesHandoff — full implementation TBD
export interface SalesHandoffPublic {
  handoff_id: string;
  account_domain: string;
  contact_id: string;
  engagement_score: number;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  tldr_text?: string;
  share_token: string;
  expires_at: string;
}
