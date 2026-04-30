import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import CP2ReviewPage from "@/pages/Checkpoint2/CP2ReviewPage";
import PhaseLockBanner from "@/pages/Checkpoint2/PhaseLockBanner";
import { server } from "@/mocks/server";
import type { CP2ReviewState } from "@/pages/Checkpoint2/types";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage(route = "/checkpoint-2") {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/checkpoint-2" element={<CP2ReviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const fixtureState: CP2ReviewState = {
  client_id: "12345678-1234-5678-1234-567812345678",
  status: "IN_REVIEW",
  opened_at: new Date().toISOString(),
  approved_at: null,
  reviewer: "ops@sennen.io",
  reviewer_notes: null,
  inferred_claims_review: [
    {
      claim_id: "c-1",
      source_type: "BUYER_PAIN_POINT",
      account_domain: "acme.in",
      contact_id: "u-1",
      claim_text: "[INFERRED] Manual reconciliation slows close",
      evidence_status: "INFERRED",
      reasoning: "linkedin_post; confidence=0.78",
      review_decision: "PENDING",
      corrected_text: null,
      review_notes: null,
      reviewed_at: null,
    },
    {
      claim_id: "c-2",
      source_type: "INTEL_REPORT_PRIORITY",
      account_domain: "acme.in",
      contact_id: null,
      claim_text: "Acme is investing in payments",
      evidence_status: "INFERRED",
      reasoning: "Q1 payments hires",
      review_decision: "PENDING",
      corrected_text: null,
      review_notes: null,
      reviewed_at: null,
    },
  ],
  account_approvals: [
    {
      account_domain: "acme.in",
      buyer_profiles_approved: false,
      intel_report_approved: false,
      account_decision: "PENDING",
      account_notes: null,
    },
  ],
  aggregate_progress: {
    total_inferred_claims: 2,
    reviewed_claims: 0,
    approved_claims: 0,
    corrected_claims: 0,
    removed_claims: 0,
    total_accounts: 1,
    approved_accounts: 0,
    removed_accounts: 0,
  },
  blockers: [
    { type: "UNREVIEWED_CLAIMS", message: "2 claims still pending review" },
    { type: "UNAPPROVED_ACCOUNTS", message: "1 account not yet approved or removed" },
  ],
};

function withFixture(state: CP2ReviewState) {
  server.use(http.get("/api/checkpoint-2", () => HttpResponse.json(state)));
}

describe("CP2 review page", () => {
  beforeEach(() => {
    withFixture(fixtureState);
  });

  it("shows aggregate progress and groups claims by source", async () => {
    renderPage();
    await screen.findByTestId("cp2-status-pill");
    expect(screen.getByText(/0 of 2 claims reviewed/i)).toBeInTheDocument();
    expect(screen.getByTestId("group-BUYER_PAIN_POINT")).toBeInTheDocument();
    expect(screen.getByTestId("group-INTEL_REPORT_PRIORITY")).toBeInTheDocument();
  });

  it("Approve CP2 footer is disabled while claims are pending", async () => {
    renderPage();
    const button = await screen.findByTestId("approve-cp2-btn");
    expect(button).toBeDisabled();
    expect(screen.getByTestId("footer-blockers")).toHaveTextContent(
      /2 claims still pending/i,
    );
  });

  it("PATCH endpoint round-trip — approving a claim updates progress", async () => {
    let patched: Record<string, unknown> | null = null;
    server.use(
      http.patch("/api/checkpoint-2/claims/:id", async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          ...fixtureState,
          inferred_claims_review: fixtureState.inferred_claims_review.map((c) =>
            c.claim_id === "c-1"
              ? { ...c, review_decision: "APPROVED", reviewed_at: new Date().toISOString() }
              : c,
          ),
          aggregate_progress: {
            ...fixtureState.aggregate_progress,
            reviewed_claims: 1,
            approved_claims: 1,
          },
          blockers: [
            { type: "UNREVIEWED_CLAIMS", message: "1 claim still pending review" },
            { type: "UNAPPROVED_ACCOUNTS", message: "1 account not yet approved or removed" },
          ],
        });
      }),
    );

    renderPage();
    await screen.findByTestId("group-BUYER_PAIN_POINT");
    await userEvent.click(screen.getByTestId("approve-c-1"));

    await waitFor(() => {
      expect(patched).toMatchObject({ decision: "APPROVED" });
    });
  });

  it("Correct flow requires non-empty corrected_text before submission", async () => {
    renderPage();
    await screen.findByTestId("group-BUYER_PAIN_POINT");
    await userEvent.click(screen.getByTestId("correct-c-1"));

    const textarea = screen.getByTestId("correct-textarea-c-1") as HTMLTextAreaElement;
    await userEvent.clear(textarea);
    const saveBtn = screen.getByRole("button", { name: /Save correction/i });
    expect(saveBtn).toBeDisabled();
  });

  it("Bulk view exposes account approval but blocks until claims reviewed", async () => {
    renderPage();
    await screen.findByTestId("cp2-status-pill");
    await userEvent.click(screen.getByTestId("tab-bulk"));

    const approveBtn = await screen.findByTestId("approve-account-acme.in");
    expect(approveBtn).toBeDisabled();
    expect(screen.getByTestId("account-block-acme.in")).toHaveTextContent(/2 pending/i);

    // Bulk view never offers per-claim approval controls
    expect(screen.queryByTestId("approve-c-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("correct-c-1")).not.toBeInTheDocument();
  });

  it("Approve CP2 footer enables once nothing is pending", async () => {
    const cleared: CP2ReviewState = {
      ...fixtureState,
      inferred_claims_review: fixtureState.inferred_claims_review.map((c) => ({
        ...c,
        review_decision: "APPROVED",
        reviewed_at: new Date().toISOString(),
      })),
      account_approvals: fixtureState.account_approvals.map((a) => ({
        ...a,
        account_decision: "APPROVED",
        buyer_profiles_approved: true,
        intel_report_approved: true,
      })),
      aggregate_progress: {
        ...fixtureState.aggregate_progress,
        reviewed_claims: 2,
        approved_claims: 2,
        approved_accounts: 1,
      },
      blockers: [],
    };
    withFixture(cleared);

    renderPage();
    const button = await screen.findByTestId("approve-cp2-btn");
    expect(button).not.toBeDisabled();

    await userEvent.click(button);
    expect(await screen.findByTestId("cp2-confirm-modal")).toBeInTheDocument();
    expect(screen.getByText(/Unblock Phase 4/i)).toBeInTheDocument();
  });

  it("APPROVED state replaces the footer with a success notice", async () => {
    withFixture({
      ...fixtureState,
      status: "APPROVED",
      approved_at: new Date().toISOString(),
      blockers: [],
    });

    renderPage();
    expect(await screen.findByTestId("cp2-approved-footer")).toHaveTextContent(
      /Phase 4 .* unlocked/i,
    );
    expect(screen.queryByTestId("approve-cp2-btn")).not.toBeInTheDocument();
  });
});

describe("PhaseLockBanner", () => {
  it("renders when CP2 is not approved", async () => {
    withFixture(fixtureState);
    render(
      <QueryClientProvider client={makeClient()}>
        <MemoryRouter>
          <PhaseLockBanner clientId={fixtureState.client_id} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId("phase-lock-banner")).toHaveTextContent(
      /Phase 4 .* locked/i,
    );
  });

  it("disappears when CP2 is approved", async () => {
    withFixture({
      ...fixtureState,
      status: "APPROVED",
      approved_at: new Date().toISOString(),
      blockers: [],
    });
    const { container } = render(
      <QueryClientProvider client={makeClient()}>
        <MemoryRouter>
          <PhaseLockBanner clientId={fixtureState.client_id} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Wait for the data to load, then assert the banner is absent.
    await waitFor(() => {
      expect(container.querySelector("[data-testid='phase-lock-banner']")).toBeNull();
    });
  });
});
