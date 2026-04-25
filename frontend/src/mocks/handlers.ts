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
