import type {
  CP4HandoffSummary,
  CP4QueuePayload,
  SalesHandoffNote,
} from "@/pages/Checkpoint4/types";

const HOURS = 60 * 60 * 1000;
const CLIENT_ID = "12345678-1234-5678-1234-567812345678";

export const MOCK_CP4_CLIENT_ID = CLIENT_ID;

function isoMinusHours(h: number): string {
  return new Date(Date.now() - h * HOURS).toISOString();
}

function buildHandoff(partial: Partial<SalesHandoffNote> & Pick<SalesHandoffNote, "handoff_id" | "account_domain" | "contact_id" | "engagement_score" | "status" | "created_at">): SalesHandoffNote {
  return {
    client_id: CLIENT_ID,
    tldr_text:
      `[CP4 Handoff] account=${partial.account_domain} contact=${partial.contact_id} score=${partial.engagement_score}\n` +
      `Triggers: 2× email reply, 1× meeting booked\n` +
      `Champion at ${partial.account_domain} engaged 2× email reply, 1× meeting booked.`,
    triggering_events: [
      { event_type: "EMAIL_REPLY", occurred_at: isoMinusHours(20), score_delta: 25 },
      { event_type: "EMAIL_REPLY", occurred_at: isoMinusHours(8), score_delta: 25 },
      { event_type: "MEETING_BOOKED", occurred_at: isoMinusHours(2), score_delta: 50 },
    ],
    notify_sent_at: null,
    accepted_at: null,
    accepted_by: null,
    escalated_at: null,
    escalation_reason: null,
    rejected_at: null,
    rejection_reason: null,
    ...partial,
  };
}

const SEED: SalesHandoffNote[] = [
  buildHandoff({
    handoff_id: "h-pending-fresh",
    account_domain: "northwind.test",
    contact_id: "c-priya",
    engagement_score: 100,
    status: "PENDING",
    created_at: isoMinusHours(2.1),
    notify_sent_at: isoMinusHours(2),
  }),
  buildHandoff({
    handoff_id: "h-pending-warn",
    account_domain: "globex.test",
    contact_id: "c-jin",
    engagement_score: 75,
    status: "PENDING",
    created_at: isoMinusHours(19.1),
    notify_sent_at: isoMinusHours(19),
  }),
  buildHandoff({
    handoff_id: "h-pending-overdue",
    account_domain: "initech.test",
    contact_id: "c-mira",
    engagement_score: 90,
    status: "PENDING",
    created_at: isoMinusHours(25.1),
    notify_sent_at: isoMinusHours(25),
  }),
  buildHandoff({
    handoff_id: "h-pending-unnotified",
    account_domain: "tyrell.test",
    contact_id: "c-eli",
    engagement_score: 60,
    status: "PENDING",
    created_at: isoMinusHours(0.5),
    notify_sent_at: null, // never sent — no SLA clock yet
  }),
  buildHandoff({
    handoff_id: "h-accepted",
    account_domain: "umbrella.test",
    contact_id: "c-amy",
    engagement_score: 110,
    status: "ACCEPTED",
    created_at: isoMinusHours(8),
    notify_sent_at: isoMinusHours(7.5),
    accepted_at: isoMinusHours(2),
    accepted_by: "alex@fcp.test",
  }),
  buildHandoff({
    handoff_id: "h-escalated",
    account_domain: "weyland.test",
    contact_id: "c-li",
    engagement_score: 65,
    status: "ESCALATED",
    created_at: isoMinusHours(50),
    notify_sent_at: isoMinusHours(48),
    escalated_at: isoMinusHours(24),
    escalation_reason: "Sales Exec did not respond within 24h of notify_sent_at",
  }),
  buildHandoff({
    handoff_id: "h-rejected",
    account_domain: "stark.test",
    contact_id: "c-ron",
    engagement_score: 60,
    status: "REJECTED",
    created_at: isoMinusHours(20),
    notify_sent_at: isoMinusHours(19),
    rejected_at: isoMinusHours(15),
    rejection_reason: "Wrong-fit account; not in our patch.",
  }),
];

let state: SalesHandoffNote[] = JSON.parse(JSON.stringify(SEED));

function summary(): CP4HandoffSummary {
  const overdue = state.filter((h) => {
    if (h.status !== "PENDING" || !h.notify_sent_at) return false;
    const deadline = new Date(h.notify_sent_at).getTime() + 24 * HOURS;
    return Date.now() >= deadline;
  });
  return {
    total: state.length,
    pending: state.filter((h) => h.status === "PENDING").length,
    accepted: state.filter((h) => h.status === "ACCEPTED").length,
    rejected: state.filter((h) => h.status === "REJECTED").length,
    escalated: state.filter((h) => h.status === "ESCALATED").length,
    overdue_pending: overdue.length,
  };
}

export function getMockCP4Queue(_clientId: string): CP4QueuePayload {
  return { summary: summary(), handoffs: [...state] };
}

export function getMockCP4Handoff(handoffId: string): SalesHandoffNote | null {
  return state.find((h) => h.handoff_id === handoffId) ?? null;
}

export function notifyMockCP4Handoff(handoffId: string): SalesHandoffNote | null {
  const h = state.find((h) => h.handoff_id === handoffId);
  if (!h) return null;
  if (h.status !== "PENDING" || h.notify_sent_at) return h;
  h.notify_sent_at = new Date().toISOString();
  return h;
}

export function acceptMockCP4Handoff(handoffId: string, acceptedBy: string): SalesHandoffNote | null {
  const h = state.find((h) => h.handoff_id === handoffId);
  if (!h) return null;
  if (h.status !== "PENDING" || !h.notify_sent_at) return h;
  h.status = "ACCEPTED";
  h.accepted_at = new Date().toISOString();
  h.accepted_by = acceptedBy;
  return h;
}

export function rejectMockCP4Handoff(handoffId: string, reason: string): SalesHandoffNote | null {
  const h = state.find((h) => h.handoff_id === handoffId);
  if (!h) return null;
  if (h.status !== "PENDING" || !h.notify_sent_at) return h;
  h.status = "REJECTED";
  h.rejected_at = new Date().toISOString();
  h.rejection_reason = reason;
  return h;
}

export function escalateOverdueMockCP4(): SalesHandoffNote[] {
  const escalated: SalesHandoffNote[] = [];
  for (const h of state) {
    if (h.status !== "PENDING" || !h.notify_sent_at) continue;
    const deadline = new Date(h.notify_sent_at).getTime() + 24 * HOURS;
    if (Date.now() < deadline) continue;
    h.status = "ESCALATED";
    h.escalated_at = new Date().toISOString();
    h.escalation_reason = "Sales Exec did not respond within 24h of notify_sent_at";
    escalated.push(h);
  }
  return escalated;
}

export function resetMockCP4(): void {
  state = JSON.parse(JSON.stringify(SEED));
}
