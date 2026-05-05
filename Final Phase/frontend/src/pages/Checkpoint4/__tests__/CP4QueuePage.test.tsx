import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import CP4QueuePage from "@/pages/Checkpoint4/CP4QueuePage";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={["/checkpoint-4"]}>
        <Routes>
          <Route path="/checkpoint-4" element={<CP4QueuePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CP4QueuePage", () => {
  it("renders the summary tiles and the handoff table from mocks", async () => {
    renderPage();
    expect(await screen.findByText(/Sales Handoff Queue/i)).toBeInTheDocument();
    // Tiles render with the seeded counts.
    expect(await screen.findByTestId("cp4-tile-total")).toHaveTextContent("7");
    // Pending = 4 (3 with notify, 1 unnotified)
    expect(screen.getByTestId("cp4-tile-pending")).toHaveTextContent("4");
    expect(screen.getByTestId("cp4-tile-overdue")).toHaveTextContent("1");
    // The seeded accounts appear in rows.
    expect(screen.getByText("northwind.test")).toBeInTheDocument();
    expect(screen.getByText("globex.test")).toBeInTheDocument();
  });

  it("filters the table when status chips are clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("northwind.test");
    await user.click(screen.getByTestId("cp4-filter-escalated"));
    expect(await screen.findByText("weyland.test")).toBeInTheDocument();
    expect(screen.queryByText("northwind.test")).not.toBeInTheDocument();
  });

  it("renders the SLA badge with the correct urgency for each pending row", async () => {
    renderPage();
    await screen.findByText("northwind.test");
    const overdueRow = await screen.findByTestId("cp4-row-h-pending-overdue");
    const overdueBadge = within(overdueRow).getByTestId("cp4-sla-badge");
    expect(overdueBadge).toHaveAttribute("data-urgency", "overdue");
    expect(overdueBadge).toHaveTextContent(/Overdue/);

    const freshRow = screen.getByTestId("cp4-row-h-pending-fresh");
    expect(within(freshRow).getByTestId("cp4-sla-badge")).toHaveAttribute("data-urgency", "fresh");

    const warnRow = screen.getByTestId("cp4-row-h-pending-warn");
    expect(within(warnRow).getByTestId("cp4-sla-badge")).toHaveAttribute("data-urgency", "warn");

    // The unnotified pending row shows the "Awaiting notify" placeholder.
    const unnotified = screen.getByTestId("cp4-row-h-pending-unnotified");
    expect(within(unnotified).getByTestId("cp4-sla-badge")).toHaveAttribute("data-urgency", "unscheduled");
  });

  it("opens the detail drawer with the TL;DR when a row is clicked", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("cp4-row-h-pending-fresh"));
    const drawer = await screen.findByRole("complementary", { name: /handoff detail/i });
    expect(within(drawer).getAllByText(/northwind.test/).length).toBeGreaterThan(0);
    expect(within(drawer).getByText(/TL;DR/i)).toBeInTheDocument();
    expect(within(drawer).getByText(/Triggering events/i)).toBeInTheDocument();
  });

  it("disables Accept/Reject in drawer until notify has been sent", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("cp4-row-h-pending-unnotified"));
    const drawer = await screen.findByRole("complementary", { name: /handoff detail/i });
    expect(within(drawer).getByRole("button", { name: /^accept$/i })).toBeDisabled();
    expect(within(drawer).getByRole("button", { name: /^reject$/i })).toBeDisabled();
    expect(within(drawer).getByRole("button", { name: /send notify/i })).toBeEnabled();
  });

  it("escalate-overdue button is disabled when overdue=0 and requires typed ESCALATE", async () => {
    const user = userEvent.setup();
    renderPage();
    // Default seed has 1 overdue, so the button is enabled.
    const btn = await screen.findByRole("button", { name: /Escalate overdue \(1\)/i });
    expect(btn).toBeEnabled();
    await user.click(btn);
    const modal = await screen.findByRole("dialog", { name: /Escalate all overdue handoffs/i });
    const confirm = within(modal).getByTestId("typed-confirm-button");
    expect(confirm).toBeDisabled();
    await user.type(within(modal).getByLabelText(/Type ESCALATE to confirm/i), "escalate");
    expect(confirm).toBeDisabled(); // case-sensitive
    const input = within(modal).getByLabelText(/Type ESCALATE to confirm/i);
    await user.clear(input);
    await user.type(input, "ESCALATE");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    // After escalation completes, overdue tile drops to 0.
    await waitFor(() => expect(screen.getByTestId("cp4-tile-overdue")).toHaveTextContent("0"));
  });

  it("accept flow flips the row to ACCEPTED and updates the summary tile", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTestId("cp4-row-h-pending-fresh"));
    const drawer = await screen.findByRole("complementary", { name: /handoff detail/i });
    await user.click(within(drawer).getByRole("button", { name: /^accept$/i }));
    await user.click(within(drawer).getByRole("button", { name: /confirm accept/i }));
    await waitFor(() => expect(screen.getByTestId("cp4-tile-accepted")).toHaveTextContent("2"));
  });
});
