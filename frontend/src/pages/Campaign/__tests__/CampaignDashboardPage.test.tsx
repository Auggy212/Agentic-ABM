import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import CampaignDashboardPage from "@/pages/Campaign/CampaignDashboardPage";
import { setMockCP3Approved } from "@/mocks/campaign";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={["/campaigns"]}>
        <Routes>
          <Route path="/campaigns" element={<CampaignDashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CampaignDashboardPage", () => {
  it("renders run status, sends, quotas, and engagement feed from mocks", async () => {
    renderPage();
    expect(await screen.findByText("Campaigns")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("campaign-summary-runs")).toHaveTextContent("2"));
    await waitFor(() => expect(screen.getByTestId("campaign-summary-sent")).toHaveTextContent("29"));
    expect(screen.getByTestId("campaign-summary-failed")).toHaveTextContent("3");
    expect(screen.getByTestId("campaign-run-run-latest")).toBeInTheDocument();
    expect(screen.getByTestId("quota-row-INSTANTLY")).toBeInTheDocument();
    expect(screen.getByText("Meeting booked")).toBeInTheDocument();
    expect(screen.getAllByText("northwind.test").length).toBeGreaterThan(0);
  });

  it("filters outbound sends by failed status", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Outbound sends");
    await user.click(screen.getByTestId("sends-filter-failed"));
    expect(await screen.findByText(/3 failed/i)).toBeInTheDocument();
    expect(screen.getAllByText("TRANSIENT").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("table")).queryByText("SENT")).not.toBeInTheDocument();
  });

  it("queues a new run when Phase 5 is unlocked", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Outbound sends");
    await user.click(screen.getByRole("button", { name: /run campaign/i }));
    expect(await screen.findByText("Run queued.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("campaign-summary-runs")).toHaveTextContent("3"));
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
  });

  it("surfaces the CP3 lock error when a run is blocked", async () => {
    const user = userEvent.setup();
    setMockCP3Approved(false);
    renderPage();
    await screen.findByText("Outbound sends");
    await user.click(screen.getByRole("button", { name: /run campaign/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Phase 5 is locked/i);
  });

  it("halts and resumes with exact RESUME confirmation", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Outbound sends");

    await user.click(screen.getByRole("button", { name: /^halt$/i }));
    const haltDialog = await screen.findByRole("dialog", { name: /halt campaign/i });
    await user.type(within(haltDialog).getByLabelText(/halt detail/i), "Pause while client reviews legal copy.");
    await user.click(within(haltDialog).getByRole("button", { name: /halt campaign/i }));

    expect(await screen.findByTestId("campaign-halt-banner")).toHaveTextContent("Campaign sends are halted");
    expect(screen.getByRole("button", { name: /run campaign/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^resume$/i }));
    const resumeDialog = await screen.findByRole("dialog", { name: /resume campaign/i });
    const confirm = within(resumeDialog).getByTestId("typed-confirm-button");
    await user.type(within(resumeDialog).getByLabelText(/type RESUME to confirm/i), "resume");
    expect(confirm).toBeDisabled();
    await user.clear(within(resumeDialog).getByLabelText(/type RESUME to confirm/i));
    await user.type(within(resumeDialog).getByLabelText(/type RESUME to confirm/i), "RESUME");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(screen.queryByTestId("campaign-halt-banner")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /run campaign/i })).toBeEnabled();
  });
});
