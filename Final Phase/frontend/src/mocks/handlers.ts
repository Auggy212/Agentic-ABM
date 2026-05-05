// @ts-nocheck
import { http, HttpResponse, delay } from "msw";
import { mockIntakeComplete, mockDraftSave, mockCsvUpload } from "./intake";
import {
  approveMockCheckpoint,
  getMockAccount,
  listMockAccounts,
  removeMockAccount,
} from "./accounts";
import {
  getMockBuyersByClient,
  getMockBuyersByDomain,
  getMockQuotaStatus as getMockBuyerQuotaStatus,
  updateMockContact,
} from "./buyers";
import {
  getMockSignalsByClient,
  getMockSignalsByDomain,
} from "./signals";
import {
  getMockVerificationByContact,
  getMockVerificationPackage,
  recheckMockContact,
} from "./verification";
import { mockAgents } from "./agents";
import { mockSequences } from "./sequences";
import { mockCopilotContext } from "./copilot";
import {
  approveMockBuyer,
  approveMockCP3,
  getMockCP3State,
  markMockOperatorComplete,
  mockCP3Messages,
  openMockMessage,
  resolveMockFeedback,
  reviewMockMessage,
  sendMockToClient,
} from "./cp3";
import {
  approveMockClientReview,
  getMockClientReview,
  submitMockClientFeedback,
} from "./client_review";
import {
  acceptMockSalesHandoff,
  getMockSalesHandoff,
  rejectMockSalesHandoff,
} from "./salesHandoff";
import {
  acceptMockCP4Handoff,
  escalateOverdueMockCP4,
  getMockCP4Handoff,
  getMockCP4Queue,
  notifyMockCP4Handoff,
  rejectMockCP4Handoff,
} from "./cp4";
import {
  getMockActiveHalts,
  getMockCampaignRun,
  getMockCampaignRuns,
  getMockEngagementFeed,
  getMockOutboundSends,
  getMockQuotaStatus,
  operatorHaltMock,
  resumeMock,
  triggerMockRun,
} from "./campaign";

// Toggle: call window.__MSW_CLARIFY() in devtools to simulate needs_clarification once
let _clarifyOnce = false;
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__MSW_CLARIFY = () => { _clarifyOnce = true; };
}

export const handlers = [
  // ── Intake ────────────────────────────────────────────────────────────────
  http.post("/api/intake", async ({ request }) => {
    await delay(600);
    const body = await request.json() as Record<string, unknown>;
    const company = body.company as Record<string, unknown> | undefined;
    const valueProp = (company?.value_prop as string) ?? "";
    const words = valueProp.trim().split(/\s+/).filter(Boolean).length;
    if (_clarifyOnce || words < 15) {
      _clarifyOnce = false;
      return HttpResponse.json({
        status: "needs_clarification",
        clarifying_questions: [
          {
            field: "company.value_prop",
            question: "Your value proposition is quite brief. Can you describe the specific outcome customers achieve and what makes you different from alternatives?",
          },
        ],
        warnings: [],
      });
    }
    return HttpResponse.json(mockIntakeComplete);
  }),

  http.post("/api/intake/draft", async () => {
    await delay(200);
    return HttpResponse.json(mockDraftSave);
  }),

  http.get("/api/intake/draft/:clientId", async () => {
    await delay(300);
    return HttpResponse.json({
      company: {
        name: "Draft Company", website: "https://draft.io", industry: "SaaS", stage: "Series A",
        product: "Draft product",
        value_prop: "This is a previously saved draft value proposition for testing the resume flow.",
        differentiators: ["feature A"], pricing_model: "Subscription", acv_range: "$10k-$50k", reference_customers: [],
      },
    });
  }),

  http.post("/api/intake/csv", async () => {
    await delay(400);
    return HttpResponse.json(mockCsvUpload);
  }),

  // ── Accounts ──────────────────────────────────────────────────────────────
  http.get("/api/accounts", async ({ request }) => {
    await delay(250);
    const url = new URL(request.url);
    return HttpResponse.json(listMockAccounts(url.searchParams));
  }),

  http.get("/api/accounts/:id", async ({ params }) => {
    await delay(200);
    const account = getMockAccount(String(params.id));
    if (!account) return HttpResponse.json({ detail: "Account not found" }, { status: 404 });
    return HttpResponse.json(account);
  }),

  http.delete("/api/accounts/:id", async ({ params, request }) => {
    await delay(250);
    const url = new URL(request.url);
    const result = removeMockAccount(String(params.id), url.searchParams.get("reason"));
    if (!result) return HttpResponse.json({ detail: "Account not found" }, { status: 404 });
    return HttpResponse.json(result);
  }),

  http.post("/api/checkpoints/1/approve", async () => {
    await delay(350);
    return HttpResponse.json(approveMockCheckpoint());
  }),

  // ── Buyers ───────────────────────────────────────────────────────────────
  http.get("/api/buyers", async ({ request }) => {
    await delay(180);
    const url = new URL(request.url);
    const company = url.searchParams.get("company");
    const clientId = url.searchParams.get("client_id");
    if (company) {
      const result = getMockBuyersByDomain(company);
      if (!result) return HttpResponse.json({ detail: "No buyers found" }, { status: 404 });
      return HttpResponse.json(result);
    }
    if (clientId) {
      const result = getMockBuyersByClient(clientId);
      if (!result) return HttpResponse.json({ detail: "No buyers found" }, { status: 404 });
      return HttpResponse.json(result);
    }
    return HttpResponse.json({ detail: "Provide either client_id or company" }, { status: 400 });
  }),

  http.patch("/api/buyers/contact/:contactId", async ({ params, request }) => {
    await delay(120);
    const body = await request.json() as Record<string, unknown>;
    const result = updateMockContact(String(params.contactId), body);
    if (!result) return HttpResponse.json({ detail: "Contact not found" }, { status: 404 });
    return HttpResponse.json({
      contact_id: result.contact_id,
      updated_fields: Object.keys(body),
      edited_at: new Date().toISOString(),
      note: typeof body.note === "string" ? body.note : null,
    });
  }),

  http.post("/api/buyers/discover", async ({ request }) => {
    await delay(180);
    const body = await request.json() as { client_id?: string };
    return HttpResponse.json({
      job_id: `job-buyers-${Date.now()}`,
      status: "queued",
      message: `Buyer enrichment queued for client_id=${body.client_id ?? "unknown"}.`,
    }, { status: 202 });
  }),

  // ── Signals ──────────────────────────────────────────────────────────────
  http.get("/api/signals", async ({ request }) => {
    await delay(160);
    const url = new URL(request.url);
    const company = url.searchParams.get("company");
    const clientId = url.searchParams.get("client_id");
    if (company) {
      const result = getMockSignalsByDomain(company);
      if (!result) return HttpResponse.json({ detail: "No signal report found" }, { status: 404 });
      return HttpResponse.json(result);
    }
    if (clientId) {
      const result = getMockSignalsByClient(clientId);
      if (!result) return HttpResponse.json({ detail: "No signal reports found" }, { status: 404 });
      return HttpResponse.json(result);
    }
    return HttpResponse.json({ detail: "Provide either client_id or company" }, { status: 400 });
  }),

  http.post("/api/signals/discover", async ({ request }) => {
    await delay(180);
    const body = await request.json() as { client_id?: string };
    return HttpResponse.json({
      job_id: `job-signals-${Date.now()}`,
      status: "queued",
      message: `Signal discovery queued for client_id=${body.client_id ?? "unknown"}.`,
    }, { status: 202 });
  }),

  http.post("/api/signals/:domain/regenerate-intel", async ({ params }) => {
    await delay(180);
    return HttpResponse.json({
      job_id: `job-intel-${Date.now()}`,
      status: "queued",
      message: `Intel regeneration queued for domain=${String(params.domain)}.`,
    }, { status: 202 });
  }),

  // ── Verification ─────────────────────────────────────────────────────────
  http.get("/api/verify", async ({ request }) => {
    await delay(160);
    const url = new URL(request.url);
    const result = getMockVerificationPackage(url.searchParams.get("client_id"));
    if (!result) return HttpResponse.json({ detail: "No verification package found" }, { status: 404 });
    return HttpResponse.json(result);
  }),

  http.get("/api/verify/contact/:contactId", async ({ params }) => {
    await delay(120);
    const result = getMockVerificationByContact(String(params.contactId));
    if (!result) return HttpResponse.json({ detail: "No verification found" }, { status: 404 });
    return HttpResponse.json(result);
  }),

  http.post("/api/verify/contact/:contactId/recheck", async ({ params }) => {
    await delay(120);
    const result = recheckMockContact(String(params.contactId));
    if (!result) return HttpResponse.json({ detail: "Contact not found" }, { status: 404 });
    return HttpResponse.json(result);
  }),

  // ── Agents ────────────────────────────────────────────────────────────────
  http.get("/api/agents", async () => {
    await delay(200);
    return HttpResponse.json(mockAgents);
  }),

  // ── Sequences ─────────────────────────────────────────────────────────────
  http.get("/api/sequences", async () => {
    await delay(220);
    return HttpResponse.json(mockSequences);
  }),

  // ── Copilot context ───────────────────────────────────────────────────────
  http.get("/api/copilot/context", async () => {
    await delay(150);
    return HttpResponse.json(mockCopilotContext());
  }),

  // ── Nav counts (drives badge numbers in the sidebar) ─────────────────────
  http.get("/api/pipeline/status", async ({ request }) => {
    await delay(180);
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id") || "12345678-1234-5678-1234-567812345678";
    return HttpResponse.json({
      client_id: clientId,
      cp3_status: "OPERATOR_REVIEW",
      agents: {
        intake: { status: "COMPLETED" },
        icp_scout: { status: "COMPLETED", progress: { processed: 150, total: 150 } },
        buyer_intel: { status: "COMPLETED", progress: { processed: 50, total: 50 } },
        signal_intel: { status: "COMPLETED", progress: { processed: 150, total: 150 } },
        verifier: { status: "COMPLETED", progress: { processed: 250, total: 250 } },
        storyteller: {
          status: "COMPLETED",
          progress: { processed: 274, total: 274 },
          cost_so_far: { claude: 14.2, gpt: 1.85, total: 16.05 },
          warning: "12 hard-fail Tier 1 messages need regeneration",
        },
        campaign: { status: "BLOCKED_ON_CHECKPOINT" },
      },
      recent_runs: [
        {
          agent: "Storyteller",
          started: new Date("2026-05-02T08:20:00Z").toISOString(),
          finished: new Date("2026-05-02T08:34:00Z").toISOString(),
          status: "COMPLETED",
          records_processed: 274,
          warnings_count: 2,
          warnings: ["2 Tier 1 hard failures", "6 diversity collisions"],
          estimated_cost: 16.05,
        },
        {
          agent: "Verifier",
          started: new Date("2026-05-01T12:00:00Z").toISOString(),
          finished: new Date("2026-05-01T12:18:00Z").toISOString(),
          status: "COMPLETED",
          records_processed: 250,
          warnings_count: 0,
        },
      ],
    });
  }),

  http.get("/api/quota/status", async () => {
    await delay(120);
    return HttpResponse.json({
      ...getMockBuyerQuotaStatus(),
      ANTHROPIC_CLAUDE: { used: 14.2, limit: 50 },
      OPENAI_GPT_4O_MINI: { used: 1.85, limit: 20 },
    });
  }),

  http.get("/api/storyteller/messages", async ({ request }) => {
    await delay(180);
    const url = new URL(request.url);
    return HttpResponse.json({ client_id: url.searchParams.get("client_id"), messages: mockCP3Messages });
  }),

  http.get("/api/checkpoint-3", async ({ request }) => {
    await delay(180);
    const url = new URL(request.url);
    return HttpResponse.json(getMockCP3State(url.searchParams.get("client_id") || ""));
  }),

  http.patch("/api/checkpoint-3/messages/:messageId", async ({ params, request }) => {
    await delay(120);
    const body = await request.json() as { decision: string; edits?: { layer: string; before: string; after: string }[]; review_notes?: string };
    return HttpResponse.json(reviewMockMessage(String(params.messageId), body.decision as never, body.edits, body.review_notes));
  }),

  http.post("/api/checkpoint-3/messages/:messageId/opened", async ({ params }) => {
    await delay(80);
    return HttpResponse.json(openMockMessage(String(params.messageId)));
  }),

  http.post("/api/checkpoint-3/buyers/:contactId/approve", async ({ params }) => {
    await delay(100);
    return HttpResponse.json(approveMockBuyer(String(params.contactId)));
  }),

  http.post("/api/checkpoint-3/operator-complete", async () => {
    await delay(160);
    return HttpResponse.json(markMockOperatorComplete());
  }),

  http.post("/api/checkpoint-3/send-to-client", async ({ request }) => {
    await delay(160);
    const body = await request.json() as { client_email: string; sample_message_ids: string[] };
    return HttpResponse.json(sendMockToClient(body.client_email, body.sample_message_ids));
  }),

  http.post("/api/checkpoint-3/feedback/:feedbackId/resolve", async ({ params, request }) => {
    await delay(120);
    const body = await request.json() as { resolution_notes: string };
    return HttpResponse.json(resolveMockFeedback(String(params.feedbackId), body.resolution_notes));
  }),

  http.post("/api/checkpoint-3/approve", async () => {
    await delay(160);
    return HttpResponse.json(approveMockCP3());
  }),

  http.get("/api/client-review/:shareToken", async ({ params }) => {
    await delay(160);
    const payload = getMockClientReview(String(params.shareToken));
    if (!payload) return HttpResponse.json({ detail: "Invalid review link" }, { status: 404 });
    return HttpResponse.json(payload);
  }),

  http.post("/api/client-review/:shareToken/feedback", async ({ params, request }) => {
    await delay(120);
    const payload = getMockClientReview(String(params.shareToken));
    if (!payload) return HttpResponse.json({ detail: "Invalid review link" }, { status: 404 });
    const body = await request.json() as { message_id: string | null; feedback_text: string; sentiment: string };
    return HttpResponse.json(submitMockClientFeedback(body.message_id, body.feedback_text, body.sentiment as never));
  }),

  http.post("/api/client-review/:shareToken/approve", async ({ request }) => {
    await delay(160);
    const body = await request.json() as { signature_name: string };
    return HttpResponse.json(approveMockClientReview(body.signature_name));
  }),

  // ── Campaign (internal Operator dashboard) ───────────────────────────────
  http.get("/api/campaign/runs", async () => {
    await delay(120);
    return HttpResponse.json(getMockCampaignRuns());
  }),

  http.get("/api/campaign/runs/:runId", async ({ params }) => {
    await delay(100);
    const run = getMockCampaignRun(String(params.runId));
    if (!run) return HttpResponse.json({ detail: "run not found" }, { status: 404 });
    return HttpResponse.json(run);
  }),

  http.get("/api/campaign/sends", async () => {
    await delay(140);
    return HttpResponse.json({ sends: getMockOutboundSends() });
  }),

  http.get("/api/campaign/engagement-feed", async () => {
    await delay(120);
    return HttpResponse.json({ events: getMockEngagementFeed() });
  }),

  http.get("/api/campaign/halts", async () => {
    await delay(80);
    return HttpResponse.json({ halts: getMockActiveHalts() });
  }),

  http.get("/api/campaign/quota-status", async () => {
    await delay(120);
    return HttpResponse.json(getMockQuotaStatus());
  }),

  http.post("/api/campaign/run", async () => {
    await delay(160);
    const result = triggerMockRun();
    if ("detail" in result) return HttpResponse.json(result, { status: 423 });
    return HttpResponse.json(result, { status: 202 });
  }),

  http.post("/api/campaign/halt", async ({ request }) => {
    await delay(140);
    const body = await request.json() as { detail: string; triggered_by: string };
    return HttpResponse.json(operatorHaltMock(body.detail, body.triggered_by));
  }),

  http.post("/api/campaign/resume", async ({ request }) => {
    await delay(140);
    const body = await request.json() as { halt_id: string; confirmation: string; resumed_by: string };
    const result = resumeMock(body.halt_id, body.confirmation, body.resumed_by);
    if ("status" in result) return HttpResponse.json({ detail: result.detail }, { status: result.status });
    return HttpResponse.json(result);
  }),

  // ── Checkpoint 4 (internal Operator queue) ───────────────────────────────
  http.get("/api/checkpoint-4", async ({ request }) => {
    await delay(140);
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id") || "";
    return HttpResponse.json(getMockCP4Queue(clientId));
  }),

  http.get("/api/checkpoint-4/:handoffId", async ({ params }) => {
    await delay(120);
    const handoff = getMockCP4Handoff(String(params.handoffId));
    if (!handoff) return HttpResponse.json({ detail: "Handoff not found" }, { status: 404 });
    return HttpResponse.json(handoff);
  }),

  http.post("/api/checkpoint-4/:handoffId/notify", async ({ params }) => {
    await delay(120);
    const handoff = notifyMockCP4Handoff(String(params.handoffId));
    if (!handoff) return HttpResponse.json({ detail: "Handoff not found" }, { status: 404 });
    return HttpResponse.json(handoff);
  }),

  http.post("/api/checkpoint-4/:handoffId/accept", async ({ params, request }) => {
    await delay(140);
    const body = await request.json() as { accepted_by: string };
    const handoff = acceptMockCP4Handoff(String(params.handoffId), body.accepted_by);
    if (!handoff) return HttpResponse.json({ detail: "Handoff not found" }, { status: 404 });
    if (handoff.status !== "ACCEPTED") return HttpResponse.json({ detail: `Cannot accept: status=${handoff.status}` }, { status: 409 });
    return HttpResponse.json(handoff);
  }),

  http.post("/api/checkpoint-4/:handoffId/reject", async ({ params, request }) => {
    await delay(140);
    const body = await request.json() as { rejection_reason: string; rejected_by: string };
    const handoff = rejectMockCP4Handoff(String(params.handoffId), body.rejection_reason);
    if (!handoff) return HttpResponse.json({ detail: "Handoff not found" }, { status: 404 });
    if (handoff.status !== "REJECTED") return HttpResponse.json({ detail: `Cannot reject: status=${handoff.status}` }, { status: 409 });
    return HttpResponse.json(handoff);
  }),

  http.post("/api/checkpoint-4/escalate-overdue", async () => {
    await delay(180);
    const escalated = escalateOverdueMockCP4();
    return HttpResponse.json({ escalated_count: escalated.length, handoffs: escalated });
  }),

  // ── Sales Handoff (external Sales Exec, token-gated) ─────────────────────
  http.get("/api/sales/handoff/:token", async ({ params }) => {
    await delay(140);
    const handoff = getMockSalesHandoff(String(params.token));
    if (!handoff) return HttpResponse.json({ detail: "Handoff link expired or invalid" }, { status: 404 });
    return HttpResponse.json(handoff);
  }),

  http.post("/api/sales/handoff/:token/accept", async ({ params, request }) => {
    await delay(140);
    const body = await request.json() as { accepted_by: string };
    const handoff = acceptMockSalesHandoff(String(params.token), body.accepted_by);
    if (!handoff) return HttpResponse.json({ detail: "Handoff link expired or invalid" }, { status: 404 });
    if (handoff.status !== "ACCEPTED") {
      return HttpResponse.json({ detail: `Handoff already ${handoff.status.toLowerCase()}` }, { status: 409 });
    }
    return HttpResponse.json(handoff);
  }),

  http.post("/api/sales/handoff/:token/reject", async ({ params, request }) => {
    await delay(140);
    const body = await request.json() as { rejection_reason: string };
    const handoff = rejectMockSalesHandoff(String(params.token), body.rejection_reason);
    if (!handoff) return HttpResponse.json({ detail: "Handoff link expired or invalid" }, { status: 404 });
    if (handoff.status !== "REJECTED") {
      return HttpResponse.json({ detail: `Handoff already ${handoff.status.toLowerCase()}` }, { status: 409 });
    }
    return HttpResponse.json(handoff);
  }),

  http.get("/api/nav-counts", async () => {
    await delay(100);
    const accounts = listMockAccounts(new URLSearchParams());
    const seqs = mockSequences.sequences.filter((s) => s.status === "active").length;
    const agents = mockAgents.agents.filter((a) => a.status === "running").length;
    return HttpResponse.json({
      accounts: accounts.total,
      sequences: seqs,
      agents: `${agents} running`,
    });
  }),
];
