export type CampaignRunStatus = "RUNNING" | "COMPLETED" | "HALTED" | "FAILED";

export type SendStatus =
  | "QUEUED"
  | "SENT"
  | "FAILED"
  | "PENDING_QUOTA_RESET"
  | "PENDING_COOKIE_REFRESH"
  | "PENDING_BUDGET"
  | "HALTED";

export type TransportName = "INSTANTLY" | "PHANTOMBUSTER" | "TWILIO" | "OPERATOR_BRIEF";

export type HaltScope = "CLIENT" | "GLOBAL";

export type HaltReason =
  | "BOUNCE_CIRCUIT_BREAKER"
  | "TRANSPORT_AUTH_FAILURE"
  | "OPERATOR_REQUESTED"
  | "GLOBAL_HALT";

export const DEFAULT_CAMPAIGN_CLIENT_ID = "12345678-1234-5678-1234-567812345678";

export interface CampaignRun {
  run_id: string;
  client_id: string;
  status: CampaignRunStatus;
  started_at: string;
  finished_at: string | null;
  total_messages: number;
  total_sent: number;
  total_failed: number;
  total_pending: number;
  halted: boolean;
  halt_reason: string | null;
  quota_warnings: { source: string; detail: string }[];
}

export interface OutboundSend {
  send_id: string;
  run_id: string | null;
  client_id: string;
  message_id: string;
  account_domain: string;
  contact_id: string | null;
  channel: "EMAIL" | "LINKEDIN_DM" | "LINKEDIN_CONNECTION" | "WHATSAPP" | "REDDIT_STRATEGY_NOTE";
  transport: TransportName;
  status: SendStatus;
  provider_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  attempted_at: string;
  completed_at: string | null;
}

export interface CampaignHalt {
  halt_id: string;
  client_id: string | null;
  scope: HaltScope;
  reason: HaltReason | string;
  detail: string;
  triggered_at: string;
  triggered_by: string;
  resumed_at: string | null;
  resumed_by: string | null;
  is_active: boolean;
}

export interface EngagementFeedItem {
  event_id: string;
  client_id?: string;
  account_domain: string;
  contact_id: string | null;
  channel?: "EMAIL" | "LINKEDIN_DM" | "LINKEDIN_CONNECTION" | "WHATSAPP";
  event_type: string;
  score_delta?: number;
  occurred_at: string;
  provider?: TransportName | "CALCOM" | "INTERNAL";
  triggered_handoff?: boolean;
}

export interface CampaignRunResponse {
  runs: CampaignRun[];
}

export interface OutboundSendsResponse {
  sends: OutboundSend[];
}

export interface EngagementFeedResponse {
  events: EngagementFeedItem[];
}

export interface ActiveHaltsResponse {
  halts: CampaignHalt[];
}

export interface TriggerRunResponse {
  status: "queued";
  client_id: string;
}
