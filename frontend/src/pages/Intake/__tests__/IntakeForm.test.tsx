import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import IntakeForm from "../IntakeForm";
import { useIntakeStore } from "@/store/intakeStore";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";

function renderIntake() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <IntakeForm />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("IntakeForm — navigation", () => {
  beforeEach(() => useIntakeStore.getState().reset());

  it("renders Step 1 on mount", () => {
    renderIntake();
    expect(screen.getByRole("heading", { level: 2, name: /Company & Product/i })).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 4/i)).toBeInTheDocument();
  });

  it("Back button is disabled on Step 1", () => {
    renderIntake();
    expect(screen.getByRole("button", { name: /← Back/i })).toBeDisabled();
  });

  it("Next button shows next step label", () => {
    renderIntake();
    expect(screen.getByRole("button", { name: /Next: Ideal Customer Profile/i })).toBeInTheDocument();
  });

  it("shows validation errors when Next is clicked on empty Step 1", async () => {
    renderIntake();
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText(/Company name is required/i)).toBeInTheDocument();
    });
  });

  it("progresses to Step 2 when Step 1 is valid", async () => {
    useIntakeStore.getState().mergeFields({
      company_name: "Acme AI",
      website: "https://acme.ai",
      industry: "SaaS",
      stage: "Series A",
      product: "AI ABM platform",
      value_prop:
        "We help Series B SaaS companies cut manual prospecting by eighty percent using real-time buyer intent signals and AI-driven account scoring.",
      differentiators: ["real-time signals"],
      pricing_model: "Subscription",
      acv_range: "$20k-$80k",
      reference_customers: [],
    });
    renderIntake();
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 4/i)).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: /Ideal Customer Profile/i })).toBeInTheDocument();
    });
  });

  it("can go Back from Step 2 to Step 1", async () => {
    useIntakeStore.getState().setStep(2);
    renderIntake();
    await userEvent.click(screen.getByRole("button", { name: /← Back/i }));
    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 4/i)).toBeInTheDocument();
    });
  });
});

describe("IntakeForm — auto-save indicator", () => {
  beforeEach(() => useIntakeStore.getState().reset());

  it("does not show save indicator initially", () => {
    renderIntake();
    expect(screen.queryByText(/^Saved\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saving/i)).not.toBeInTheDocument();
  });
});

describe("IntakeForm — progress bar", () => {
  beforeEach(() => useIntakeStore.getState().reset());

  it("progress bar reflects current step fraction", () => {
    renderIntake();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "4");
  });

  it("shows ✓ for completed steps in breadcrumbs", async () => {
    useIntakeStore.getState().mergeFields({
      company_name: "Acme AI",
      website: "https://acme.ai",
      industry: "SaaS",
      stage: "Series A",
      product: "AI ABM platform",
      value_prop:
        "We help Series B SaaS companies cut manual prospecting by eighty percent using real-time buyer intent signals and AI-driven account scoring.",
      differentiators: ["real-time signals"],
      pricing_model: "Subscription",
      acv_range: "$20k-$80k",
      reference_customers: [],
    });
    renderIntake();
    await userEvent.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 4/i)).toBeInTheDocument();
    });
    // Step 1 breadcrumb should now have a ✓
    const breadcrumbs = screen.getAllByText(/Company & Product/i);
    expect(breadcrumbs[0].textContent).toContain("✓");
  });
});

describe("IntakeForm — Step 4 final submit", () => {
  beforeEach(() => useIntakeStore.getState().reset());

  it("shows 'Submit & Start Discovery' on final step", () => {
    useIntakeStore.getState().setStep(4);
    renderIntake();
    expect(
      screen.getByRole("button", { name: /Submit & Start Discovery/i })
    ).toBeInTheDocument();
  });

  it("shows clarifying questions modal when backend returns needs_clarification", async () => {
    // Override handler to always return needs_clarification
    server.use(
      http.post("/api/intake", () =>
        HttpResponse.json({
          status: "needs_clarification",
          clarifying_questions: [
            { field: "company.value_prop", question: "Please elaborate on your value prop." },
          ],
          warnings: [],
        })
      )
    );

    // Fill all 4 steps minimally via store
    useIntakeStore.getState().mergeFields({
      company_name: "Acme AI", website: "https://acme.ai", industry: "SaaS",
      stage: "Series A", product: "AI ABM",
      value_prop: "We help Series B SaaS companies cut manual prospecting by eighty percent using real-time buyer intent signals and AI.",
      differentiators: ["x"], pricing_model: "Subscription", acv_range: "$10k",
      icp_industries: ["SaaS"], company_size_employees: "100-500",
      company_size_arr: "$5M", funding_stage: ["Series A"], geographies: ["USA"],
      buying_triggers: ["new hire"], negative_icp: [], negative_icp_confirmed_empty: true,
      titles: ["VP Sales"], seniority: ["VP"], buying_committee_size: "3-5",
      pain_points: ["pain"], competitors: [{ name: "Comp", weaknesses: ["expensive"] }],
      win_themes: ["ROI"], loss_themes: ["budget"], channels: ["LinkedIn"], crm: "HubSpot",
    });
    useIntakeStore.getState().setStep(4);

    renderIntake();
    await userEvent.click(screen.getByRole("button", { name: /Submit & Start Discovery/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(/Please elaborate on your value prop/i)).toBeInTheDocument();
    });
  });
});
