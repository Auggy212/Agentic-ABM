import { http, HttpResponse, delay } from "msw";
import { mockIntakeComplete, mockDraftSave, mockCsvUpload } from "./intake";
import {
  approveMockCheckpoint,
  getMockAccount,
  listMockAccounts,
  removeMockAccount,
} from "./accounts";
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
      APOLLO_CONTACTS: { used: 48, limit: 50 },
      HUNTER: { used: 100, limit: 100 },
      LUSHA: { used: 42, limit: 100 },
      NEVERBOUNCE: { used: 250, limit: 1000 },
      ZEROBOUNCE: { used: 38, limit: 100 },
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
