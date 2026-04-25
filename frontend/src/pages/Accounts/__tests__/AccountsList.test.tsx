import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AccountsList from "../AccountsList";

function renderAccountsList() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 0 },
      mutations: { retry: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/accounts"]}>
        <Routes>
          <Route path="/accounts" element={<AccountsList />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function getBodyRows() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

describe("AccountsList", () => {
  it("renders the table, sorts, and filters accounts", async () => {
    renderAccountsList();

    await screen.findByText(/ICP Scout Account Review/i);

    await userEvent.click(screen.getByRole("button", { name: /Company Name/i }));

    await waitFor(() => {
      const firstRow = getBodyRows()[0];
      expect(within(firstRow).getByRole("link", { name: /SignalWorks 1/i })).toBeInTheDocument();
    });

    await userEvent.clear(screen.getByLabelText(/Search/i));
    await userEvent.type(screen.getByLabelText(/Search/i), "signal-2.example.com");
    await userEvent.click(screen.getByRole("button", { name: /Tier 2/i }));
    await userEvent.click(screen.getByRole("button", { name: /HARMONIC/i }));

    await waitFor(() => {
      const rows = getBodyRows();
      expect(rows).toHaveLength(1);
      expect(within(rows[0]).getByRole("link", { name: /SignalWorks 2/i })).toBeInTheDocument();
    });
  });

  it("requires a removal reason before bulk remove can submit", async () => {
    renderAccountsList();

    await screen.findByText(/ICP Scout Account Review/i);

    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes[1]);
    await userEvent.click(screen.getByRole("button", { name: /Remove selected \(1\)/i }));

    const removeButton = screen.getByRole("button", { name: /Remove from list/i });
    expect(removeButton).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText(/Reason for removal/i), "Not true ICP fit");

    expect(removeButton).toBeEnabled();
  });

  it("keeps Phase 2 locked until CP1 is approved", async () => {
    renderAccountsList();

    expect(await screen.findByText(/Phase 2 is locked until you approve CP1/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Approve List/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Phase 2 is locked until you approve CP1/i)).not.toBeInTheDocument();
      expect(screen.getByText(/Checkpoint 1 approved/i)).toBeInTheDocument();
    });
  });

  it("shows quota warnings when the run meta includes them", async () => {
    renderAccountsList();

    expect(await screen.findByText(/Quota warning/i)).toBeInTheDocument();
    expect(screen.getByText(/Apollo quota exhausted mid-run/i)).toBeInTheDocument();
  });
});
