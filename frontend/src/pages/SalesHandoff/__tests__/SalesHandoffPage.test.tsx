import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import SalesHandoffPage from "@/pages/SalesHandoff/SalesHandoffPage";
import {
  MOCK_ACCEPTED_TOKEN,
  MOCK_ESCALATED_TOKEN,
  MOCK_OVERDUE_TOKEN,
  MOCK_PENDING_TOKEN,
} from "@/mocks/salesHandoff";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderAt(token: string) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={[`/sales/handoff/${token}`]}>
        <Routes>
          <Route path="/sales/handoff/:token" element={<SalesHandoffPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SalesHandoffPage", () => {
  it("renders the lead summary, why-now triggers, and Accept/Decline action bar", async () => {
    renderAt(MOCK_PENDING_TOKEN);
    expect(await screen.findByText("Priya Raman")).toBeInTheDocument();
    expect(screen.getByText(/Northwind Logistics/)).toBeInTheDocument();
    expect(screen.getByText("Why now")).toBeInTheDocument();
    // Triggering events surface as human labels
    const why = screen.getByText("Why now").closest("section");
    expect(within(why!).getAllByText(/Email reply/).length).toBe(2);
    expect(within(why!).getByText(/Meeting booked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /accept lead/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /decline lead/i })).toBeEnabled();
  });

  it("strips internal '[CP4 Handoff]' header from the summary text", async () => {
    renderAt(MOCK_PENDING_TOKEN);
    await screen.findByText("Priya Raman");
    expect(screen.queryByText(/\[CP4 Handoff\]/)).not.toBeInTheDocument();
  });

  it("shows a fresh (green) SLA badge for a recently-notified handoff", async () => {
    renderAt(MOCK_PENDING_TOKEN);
    const badge = await screen.findByTestId("sla-badge");
    expect(badge.textContent).toMatch(/remaining/);
    // Background is the green tint, not red.
    expect(badge.getAttribute("style")).toContain("rgb(220, 252, 231)");
  });

  it("shows an overdue badge when notify_sent_at + sla has elapsed", async () => {
    renderAt(MOCK_OVERDUE_TOKEN);
    const badge = await screen.findByTestId("sla-badge");
    expect(badge.textContent).toMatch(/Overdue/);
    expect(badge.getAttribute("style")).toContain("rgb(254, 226, 226)");
  });

  it("renders the Accepted view when handoff is already ACCEPTED", async () => {
    renderAt(MOCK_ACCEPTED_TOKEN);
    expect(await screen.findByText(/Lead accepted/i)).toBeInTheDocument();
    // Sticky action bar must NOT render in terminal states.
    expect(screen.queryByRole("button", { name: /accept lead/i })).not.toBeInTheDocument();
  });

  it("renders the Expired view for ESCALATED handoffs (no internal terminology)", async () => {
    renderAt(MOCK_ESCALATED_TOKEN);
    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument();
    // External surface must never show the internal status word.
    expect(screen.queryByText(/ESCALATED/i)).not.toBeInTheDocument();
  });

  it("renders the Expired view on a 404 token", async () => {
    renderAt("not-a-real-token");
    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument();
  });

  it("opens the AcceptModal, requires a name, then accepts and shows the success view", async () => {
    const user = userEvent.setup();
    renderAt(MOCK_PENDING_TOKEN);
    await screen.findByText("Priya Raman");

    await user.click(screen.getByRole("button", { name: /accept lead/i }));
    const modal = await screen.findByRole("dialog", { name: /accept lead/i });
    const confirm = within(modal).getByRole("button", { name: /confirm/i });
    expect(confirm).toBeDisabled();

    await user.type(within(modal).getByLabelText(/your name/i), "alex@fcp.test");
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(screen.getByText(/Lead accepted/i)).toBeInTheDocument());
  });

  it("opens the DeclineModal and blocks confirm until the reason is long enough", async () => {
    const user = userEvent.setup();
    renderAt(MOCK_PENDING_TOKEN);
    await screen.findByText("Priya Raman");

    await user.click(screen.getByRole("button", { name: /decline lead/i }));
    const modal = await screen.findByRole("dialog", { name: /decline lead/i });
    const confirm = within(modal).getByRole("button", { name: /^decline$/i });
    expect(confirm).toBeDisabled();

    await user.type(within(modal).getByLabelText(/reason/i), "Bad fit; already a customer");
    expect(confirm).toBeEnabled();
  });
});
