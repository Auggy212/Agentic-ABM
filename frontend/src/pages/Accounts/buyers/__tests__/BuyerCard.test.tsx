import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import BuyerCard from "../BuyerCard";
import type { BuyerProfile } from "../types";

// Stub useUpdateBuyerRole so PATCH calls don't hit real network
vi.mock("../hooks", () => ({
  useUpdateBuyerRole: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
  useDiscoverBuyers: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
  }),
}));

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const BASE_CONTACT: BuyerProfile = {
  contact_id: "test-0001",
  account_domain: "acme.example.com",
  full_name: "Priya Menon",
  first_name: "Priya",
  last_name: "Menon",
  current_title: "Chief Revenue Officer",
  apollo_title: "Chief Revenue Officer",
  title_mismatch_flag: false,
  seniority: "C_SUITE",
  department: "Revenue",
  email: "priya.menon@acme.example.com",
  email_status: "VALID",
  phone: "+91-98765-43210",
  linkedin_url: "https://linkedin.com/in/priya-menon",
  tenure_current_role_months: 18,
  tenure_current_company_months: 36,
  job_change_signal: false,
  committee_role: "DECISION_MAKER",
  committee_role_confidence: 0.95,
  committee_role_reasoning: "Title 'Chief Revenue Officer' contains a C-suite token — assigned DECISION_MAKER (exact match).",
  inferred_pain_points: [
    {
      pain_point: "Difficulty with manual prospecting",
      reasoning: "Contact title aligns with prospecting responsibility area — [INFERRED]",
      confidence: 0.6,
      tag: "[INFERRED]",
    },
  ],
  recent_activity: [],
  source: "APOLLO",
  enriched_at: new Date().toISOString(),
};

describe("BuyerCard", () => {
  it("renders name and title", () => {
    wrapper(<BuyerCard contact={BASE_CONTACT} />);
    expect(screen.getByText("Priya Menon")).toBeInTheDocument();
    expect(screen.getByText("Chief Revenue Officer")).toBeInTheDocument();
  });

  it("renders email with VALID badge", () => {
    wrapper(<BuyerCard contact={BASE_CONTACT} />);
    expect(screen.getByText("priya.menon@acme.example.com")).toBeInTheDocument();
    expect(screen.getByText("Valid")).toBeInTheDocument();
  });

  it("renders DECISION_MAKER role badge", () => {
    wrapper(<BuyerCard contact={BASE_CONTACT} />);
    expect(screen.getByText("Decision-Maker")).toBeInTheDocument();
  });

  it("shows collapsible confidence reason", () => {
    wrapper(<BuyerCard contact={BASE_CONTACT} />);
    const btn = screen.getByText(/95% confident/);
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByText(/C-suite token/)).toBeInTheDocument();
  });

  it("shows job change banner when job_change_signal=true", () => {
    const contact: BuyerProfile = {
      ...BASE_CONTACT,
      tenure_current_role_months: 4,
      job_change_signal: true,
    };
    wrapper(<BuyerCard contact={contact} />);
    expect(screen.getByText(/Joined.*ago.*strong signal/i)).toBeInTheDocument();
  });

  it("does NOT show job change banner when job_change_signal=false", () => {
    wrapper(<BuyerCard contact={BASE_CONTACT} />);
    expect(screen.queryByText(/strong signal/i)).toBeNull();
  });

  it("shows title mismatch banner when title_mismatch_flag=true", () => {
    const contact: BuyerProfile = {
      ...BASE_CONTACT,
      apollo_title: "Director of Sales",
      current_title: "VP of Sales",
      title_mismatch_flag: true,
    };
    wrapper(<BuyerCard contact={contact} />);
    expect(screen.getByText(/Apollo says/i)).toBeInTheDocument();
    expect(screen.getByText(/Verifier will reconcile/i)).toBeInTheDocument();
  });

  it("does NOT show title mismatch banner when flag=false", () => {
    wrapper(<BuyerCard contact={BASE_CONTACT} />);
    expect(screen.queryByText(/Verifier will reconcile/i)).toBeNull();
  });

  it("shows 'Manually corrected' pill when manual_override_reason is set", () => {
    const contact: BuyerProfile = {
      ...BASE_CONTACT,
      manual_override_reason: "Confirmed via call",
    };
    wrapper(<BuyerCard contact={contact} />);
    expect(screen.getByText(/Manually corrected/i)).toBeInTheDocument();
  });

  it("does NOT show 'Manually corrected' pill when no override", () => {
    wrapper(<BuyerCard contact={BASE_CONTACT} />);
    expect(screen.queryByText(/Manually corrected/i)).toBeNull();
  });

  it("shows UNVERIFIED email badge for unverified contacts", () => {
    const contact: BuyerProfile = { ...BASE_CONTACT, email_status: "UNVERIFIED" };
    wrapper(<BuyerCard contact={contact} />);
    expect(screen.getByText("Unverified")).toBeInTheDocument();
  });

  it("shows CATCH_ALL badge in amber style", () => {
    const contact: BuyerProfile = { ...BASE_CONTACT, email_status: "CATCH_ALL" };
    wrapper(<BuyerCard contact={contact} />);
    expect(screen.getByText("Catch-all")).toBeInTheDocument();
  });

  it("shows INVALID badge for invalid email", () => {
    const contact: BuyerProfile = { ...BASE_CONTACT, email_status: "INVALID" };
    wrapper(<BuyerCard contact={contact} />);
    expect(screen.getByText("Invalid")).toBeInTheDocument();
  });

  it("shows recent activity placeholder — intentional empty state", () => {
    wrapper(<BuyerCard contact={BASE_CONTACT} />);
    expect(screen.getByText(/Phase 3.*PhantomBuster.*will fill this in/i)).toBeInTheDocument();
  });

  it("expands pain points when toggled", () => {
    wrapper(<BuyerCard contact={BASE_CONTACT} />);
    const toggle = screen.getByText(/Inferred pain points/i);
    fireEvent.click(toggle);
    expect(screen.getByText("Difficulty with manual prospecting")).toBeInTheDocument();
    expect(screen.getByText("[INFERRED]")).toBeInTheDocument();
    expect(screen.getByText(/reviewed in Checkpoint 2/i)).toBeInTheDocument();
  });

  it("opens role change modal from three-dot menu", async () => {
    wrapper(<BuyerCard contact={BASE_CONTACT} />);
    const menuBtn = screen.getByTitle("Actions");
    fireEvent.click(menuBtn);
    const changeRole = screen.getByText("Change role");
    fireEvent.click(changeRole);
    await waitFor(() => {
      expect(screen.getByText("Change committee role")).toBeInTheDocument();
    });
  });

  it("role override modal requires a reason before submit is enabled", async () => {
    wrapper(<BuyerCard contact={BASE_CONTACT} />);
    fireEvent.click(screen.getByTitle("Actions"));
    fireEvent.click(screen.getByText("Change role"));
    await waitFor(() => screen.getByText("Change committee role"));

    const saveBtn = screen.getByText("Save override").closest("button");
    expect(saveBtn).toBeDisabled();

    const textarea = screen.getByPlaceholderText(/Explain why/i);
    fireEvent.change(textarea, { target: { value: "Confirmed in call" } });

    // Save should now be enabled (role also needs to differ from current)
    // Select Champion first
    fireEvent.click(screen.getByText("Champion"));
    expect(saveBtn).not.toBeDisabled();
  });
});
