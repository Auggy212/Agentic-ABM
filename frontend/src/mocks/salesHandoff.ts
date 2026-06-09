import type { SalesHandoffPublic } from "@/pages/SalesHandoff/types";

// Mock-first per master prompt §2. Token == handoff_id in mocks; backend will
// add a separate share_token column in a follow-up.

export const MOCK_PENDING_TOKEN = "tok_pending_fresh";
export const MOCK_OVERDUE_TOKEN = "tok_pending_overdue";
export const MOCK_ACCEPTED_TOKEN = "tok_accepted";
export const MOCK_ESCALATED_TOKEN = "tok_escalated";
export const MOCK_REJECTED_TOKEN = "tok_rejected";

const HOURS = 60 * 60 * 1000;

function isoMinusHours(h: number): string {
  return new Date(Date.now() - h * HOURS).toISOString();
}

const sharedTriggers = [
  { event_type: "EMAIL_REPLY", occurred_at: isoMinusHours(20), score_delta: 25 },
  { event_type: "EMAIL_REPLY", occurred_at: isoMinusHours(8), score_delta: 25 },
  { event_type: "MEETING_BOOKED", occurred_at: isoMinusHours(2), score_delta: 50 },
] as const;

function buildPending(notifyHoursAgo: number): SalesHandoffPublic {
  return {
    handoff_id: MOCK_PENDING_TOKEN,
    account_display_name: "Northwind Logistics",
    contact_display_name: "Priya Raman",
    contact_title: "VP, Revenue Operations",
    tldr_text:
      "[CP4 Handoff] account=northwind.test contact=priya score=100\n" +
      "Triggers: 2× email reply, 1× meeting booked\n" +
      "Champion at northwind.test engaged 2× email reply, 1× meeting booked. Most recent: meeting booked on " +
      new Date(Date.now() - 2 * HOURS).toISOString().slice(0, 10) +
      ".",
    triggering_events: [...sharedTriggers],
    meeting_link: "https://cal.com/northwind/intro",
    status: "PENDING",
    created_at: isoMinusHours(notifyHoursAgo + 0.1),
    notify_sent_at: isoMinusHours(notifyHoursAgo),
    sla_hours: 24,
    accepted_at: null,
    accepted_by: null,
    rejected_at: null,
    rejection_reason: null,
  };
}

const FIXTURES: Record<string, SalesHandoffPublic> = {
  [MOCK_PENDING_TOKEN]: buildPending(2),         // Fresh: 22h remaining
  [MOCK_OVERDUE_TOKEN]: {                        // 0h remaining (operator hasn't escalated yet)
    ...buildPending(25),
    handoff_id: MOCK_OVERDUE_TOKEN,
  },
  [MOCK_ACCEPTED_TOKEN]: {
    ...buildPending(4),
    handoff_id: MOCK_ACCEPTED_TOKEN,
    status: "ACCEPTED",
    accepted_at: isoMinusHours(1),
    accepted_by: "alex@fcp.test",
  },
  [MOCK_ESCALATED_TOKEN]: {
    ...buildPending(28),
    handoff_id: MOCK_ESCALATED_TOKEN,
    status: "ESCALATED",
  },
  [MOCK_REJECTED_TOKEN]: {
    ...buildPending(6),
    handoff_id: MOCK_REJECTED_TOKEN,
    status: "REJECTED",
    rejected_at: isoMinusHours(2),
    rejection_reason: "Wrong-fit account; not in our patch.",
  },
};

const state: Record<string, SalesHandoffPublic> = JSON.parse(JSON.stringify(FIXTURES));

export function getMockSalesHandoff(token: string): SalesHandoffPublic | null {
  return state[token] ?? null;
}

export function acceptMockSalesHandoff(token: string, acceptedBy: string): SalesHandoffPublic | null {
  const handoff = state[token];
  if (!handoff) return null;
  if (handoff.status !== "PENDING") return handoff;
  handoff.status = "ACCEPTED";
  handoff.accepted_at = new Date().toISOString();
  handoff.accepted_by = acceptedBy;
  return handoff;
}

export function rejectMockSalesHandoff(token: string, reason: string): SalesHandoffPublic | null {
  const handoff = state[token];
  if (!handoff) return null;
  if (handoff.status !== "PENDING") return handoff;
  handoff.status = "REJECTED";
  handoff.rejected_at = new Date().toISOString();
  handoff.rejection_reason = reason;
  return handoff;
}

export function resetMockSalesHandoffs(): void {
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, JSON.parse(JSON.stringify(FIXTURES)));
}
