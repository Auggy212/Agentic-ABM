import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import VerificationDashboard from "@/pages/Verification/VerificationDashboard";
import { getMockVerificationByContact, getMockVerificationPackage } from "@/mocks/verification";
import { server } from "@/mocks/server";
import ContactVerificationCard from "../ContactVerificationCard";
import VerificationTab from "../VerificationTab";

function renderWithProviders(ui: React.ReactElement, route = "/") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderDashboard(route = "/verification?client_id=12345678-1234-5678-1234-567812345678") {
  return renderWithProviders(
    <Routes>
      <Route path="/verification" element={<VerificationDashboard />} />
    </Routes>,
    route,
  );
}

describe("verification views", () => {
  it("highlights the lowest per-source pass-rate source", async () => {
    renderDashboard();

    await screen.findByText(/Per-source pass-rate breakdown/i);
    const hunter = screen.getByTestId("source-breakdown-hunter");

    expect(hunter).toHaveStyle({ border: "2px solid #f59e0b" });
    expect(screen.getByText(/Lowest-quality source: hunter/i)).toBeInTheDocument();
  });

  it("shows diagnosis banner only when target is missed", async () => {
    const first = renderDashboard();
    expect(await screen.findByTestId("diagnosis-banner")).toBeInTheDocument();
    first.unmount();

    const passing = getMockVerificationPackage("12345678-1234-5678-1234-567812345678")!;
    server.use(
      http.get("/api/verify", () =>
        HttpResponse.json({
          ...passing,
          meets_deliverability_target: true,
          target_miss_diagnosis: null,
          aggregate: { ...passing.aggregate, deliverability_rate: 0.94 },
        }),
      ),
    );

    renderDashboard();
    await screen.findByText(/Per-source pass-rate breakdown/i);
    expect(screen.queryByTestId("diagnosis-banner")).not.toBeInTheDocument();
  });

  it("shows both engine badges when ZeroBounce was used", () => {
    const verification = getMockVerificationByContact("c1000-0001-0000-0000-000000000002")!;
    renderWithProviders(<ContactVerificationCard verification={verification} />);

    expect(screen.getByRole("button", { name: /NeverBounce check/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ZeroBounce check/i })).toBeInTheDocument();
  });

  it("shows PhantomBuster pending indicator for unresolved title mismatches", () => {
    const verification = getMockVerificationByContact("c1000-0001-0000-0000-000000000002")!;
    renderWithProviders(<ContactVerificationCard verification={verification} />);

    expect(screen.getByText(/PhantomBuster reconciliation deferred to Phase 5/i)).toBeInTheDocument();
  });

  it("re-check button calls the contact recheck endpoint", async () => {
    const posted: string[] = [];
    server.use(
      http.post("/api/verify/contact/:contactId/recheck", ({ params }) => {
        posted.push(String(params.contactId));
        return HttpResponse.json({ job_id: "job-test", status: "queued", message: "queued" });
      }),
    );

    renderWithProviders(
      <VerificationTab
        domain="signal-1.example.com"
        clientId="12345678-1234-5678-1234-567812345678"
      />,
    );

    const button = await screen.findByRole("button", { name: /Re-verify/i });
    await userEvent.click(button);

    await waitFor(() => {
      expect(posted).toContain("c1000-0001-0000-0000-000000000001");
    });
  });
});
