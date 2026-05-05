// @ts-nocheck
import type {
  CampaignHalt,
  CampaignRun,
  EngagementFeedItem,
  OutboundSend,
} from "@/pages/Campaign/types";

const HOURS = 60 * 60 * 1000;
const MINUTES = 60 * 1000;
const CLIENT_ID = "12345678-1234-5678-1234-567812345678";
export const MOCK_CAMPAIGN_CLIENT_ID = CLIENT_ID;

function isoMinus(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

interface MockState {
  cp3Approved: boolean;
  runs: CampaignRun[];
  sends: OutboundSend[];
  halts: CampaignHalt[];
  feed: EngagementFeedItem[];
  quotas: { source: string; window: string; used: number; limit: number; remaining: number; exhausted: boolean; window_kind: "monthly" | "daily" }[];
}

function buildSeed(): MockState {
  const sends: OutboundSend[] = [];
  const accounts = ["northwind.test", "globex.test", "initech.test", "umbrella.test"];
  for (let i = 0; i < 32; i++) {
    const acc = accounts[i % accounts.length];
    const channel = i % 3 === 0 ? "LINKEDIN_DM" : i % 3 === 1 ? "EMAIL" : "WHATSAPP";
    const transport = channel === "EMAIL" ? "INSTANTLY" : channel === "WHATSAPP" ? "TWILIO" : "PHANTOMBUSTER";
    const failed = i % 11 === 0;
    sends.push({
      send_id: `send-${i}`,
      run_id: "run-latest",
      client_id: CLIENT_ID,
      message_id: `msg-${i}`,
      account_domain: acc,
      contact_id: `c-${i}`,
      channel: channel as OutboundSend["channel"],
      transport: transport as OutboundSend["transport"],
      status: failed ? "FAILED" : "SENT",
      provider_message_id: `prov-${i}`,
      error_code: failed ? "TRANSIENT" : null,
      error_message: failed ? "Transport returned a transient failure." : null,
      attempted_at: isoMinus((32 - i) * MINUTES),
      completed_at: isoMinus((32 - i) * MINUTES - 1000),
    });
  }
  const runs: CampaignRun[] = [
    {
      run_id: "run-latest",
      client_id: CLIENT_ID,
      status: "COMPLETED",
      started_at: isoMinus(45 * MINUTES),
      finished_at: isoMinus(38 * MINUTES),
      total_messages: 32,
      total_sent: sends.filter((s) => s.status === "SENT").length,
      total_failed: sends.filter((s) => s.status === "FAILED").length,
      total_pending: 0,
      halted: false,
      halt_reason: null,
      quota_warnings: [{ source: "INSTANTLY", detail: "INSTANTLY quota at 92%; investigate before next run" }],
    },
    {
      run_id: "run-prev",
      client_id: CLIENT_ID,
      status: "COMPLETED",
      started_at: isoMinus(8 * HOURS),
      finished_at: isoMinus(8 * HOURS - 4 * MINUTES),
      total_messages: 18,
      total_sent: 18,
      total_failed: 0,
      total_pending: 0,
      halted: false,
      halt_reason: null,
      quota_warnings: [],
    },
  ];
  const feed: EngagementFeedItem[] = [
    { event_id: "e1", client_id: CLIENT_ID, account_domain: "northwind.test", contact_id: "c-priya", channel: "EMAIL", event_type: "MEETING_BOOKED", score_delta: 50, provider: "CALCOM", occurred_at: isoMinus(2 * MINUTES), triggered_handoff: true },
    { event_id: "e2", client_id: CLIENT_ID, account_domain: "globex.test", contact_id: "c-jin", channel: "EMAIL", event_type: "EMAIL_REPLY", score_delta: 25, provider: "INSTANTLY", occurred_at: isoMinus(12 * MINUTES), triggered_handoff: false },
    { event_id: "e3", client_id: CLIENT_ID, account_domain: "initech.test", contact_id: "c-mira", channel: "WHATSAPP", event_type: "WHATSAPP_REPLY", score_delta: 30, provider: "TWILIO", occurred_at: isoMinus(40 * MINUTES), triggered_handoff: true },
    { event_id: "e4", client_id: CLIENT_ID, account_domain: "umbrella.test", contact_id: "c-amy", channel: "LINKEDIN_DM", event_type: "LINKEDIN_DM_REPLY", score_delta: 25, provider: "PHANTOMBUSTER", occurred_at: isoMinus(2 * HOURS), triggered_handoff: false },
  ];
  return {
    cp3Approved: true,
    runs,
    sends,
    halts: [],
    feed,
    quotas: [
      { source: "INSTANTLY", window: "202605", used: 9200, limit: 10000, remaining: 800, exhausted: false, window_kind: "monthly" },
      { source: "PHANTOMBUSTER", window: "20260504", used: 220, limit: 240, remaining: 20, exhausted: false, window_kind: "daily" },
      { source: "TWILIO", window: "202605", used: 4000, limit: 10000, remaining: 6000, exhausted: false, window_kind: "monthly" },
      { source: "APOLLO", window: "202605", used: 50, limit: 50, remaining: 0, exhausted: true, window_kind: "monthly" },
      { source: "HUNTER", window: "202605", used: 12, limit: 25, remaining: 13, exhausted: false, window_kind: "monthly" },
      { source: "NEVERBOUNCE", window: "202605", used: 250, limit: 1000, remaining: 750, exhausted: false, window_kind: "monthly" },
    ],
  };
}

let state: MockState = buildSeed();

export function resetMockCampaign(): void {
  state = buildSeed();
}

export function setMockCP3Approved(approved: boolean): void {
  state.cp3Approved = approved;
}

export function getMockCampaignRuns(): { runs: CampaignRun[] } {
  return { runs: [...state.runs] };
}

export function getMockCampaignRun(runId: string): CampaignRun | null {
  return state.runs.find((r) => r.run_id === runId) ?? null;
}

export function getMockOutboundSends(): OutboundSend[] {
  return [...state.sends].sort((a, b) => b.attempted_at.localeCompare(a.attempted_at));
}

export function getMockEngagementFeed(): EngagementFeedItem[] {
  return [...state.feed].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export function getMockActiveHalts(): CampaignHalt[] {
  return state.halts.filter((h) => h.is_active);
}

export function getMockQuotaStatus() {
  return { quotas: state.quotas };
}

export function isCP3Approved(): boolean {
  return state.cp3Approved;
}

export function triggerMockRun(): { status: string; client_id: string } | { detail: string } {
  if (!state.cp3Approved) return { detail: "CP3 review status is OPERATOR_REVIEW, not APPROVED; Phase 5 is locked" };
  if (getMockActiveHalts().length > 0) return { detail: "Campaign halted (operator-requested)." };
  const newRun: CampaignRun = {
    run_id: `run-${Date.now()}`,
    client_id: CLIENT_ID,
    status: "RUNNING",
    started_at: new Date().toISOString(),
    finished_at: null,
    total_messages: 0,
    total_sent: 0,
    total_failed: 0,
    total_pending: 0,
    halted: false,
    halt_reason: null,
    quota_warnings: [],
  };
  state.runs.unshift(newRun);
  return { status: "queued", client_id: CLIENT_ID };
}

export function operatorHaltMock(detail: string, triggeredBy: string): CampaignHalt {
  const halt: CampaignHalt = {
    halt_id: `halt-${Date.now()}`,
    client_id: CLIENT_ID,
    scope: "CLIENT",
    reason: "OPERATOR_REQUESTED",
    detail,
    triggered_at: new Date().toISOString(),
    triggered_by: triggeredBy,
    resumed_at: null,
    resumed_by: null,
    is_active: true,
  };
  state.halts.unshift(halt);
  return halt;
}

export function resumeMock(haltId: string, confirmation: string, resumedBy: string): CampaignHalt | { detail: string; status: number } {
  if (confirmation !== "RESUME") {
    return { detail: "confirmation token must be exactly 'RESUME'", status: 400 };
  }
  const halt = state.halts.find((h) => h.halt_id === haltId);
  if (!halt) return { detail: "halt not found", status: 404 };
  halt.resumed_at = new Date().toISOString();
  halt.resumed_by = resumedBy;
  halt.is_active = false;
  return halt;
}
