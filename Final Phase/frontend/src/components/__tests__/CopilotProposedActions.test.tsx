import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import CopilotProposedActions from "@/components/CopilotProposedActions";
import { server } from "@/mocks/server";
import type { CopilotProposedAction } from "@/types/copilot";

function renderActions(actions: CopilotProposedAction[], onResult = vi.fn()) {
  return render(
    <MemoryRouter initialEntries={["/start"]}>
      <Routes>
        <Route path="/start" element={<CopilotProposedActions actions={actions} onResult={onResult} />} />
        <Route path="/checkpoint-3" element={<div data-testid="cp3-landed">CP3</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CopilotProposedActions", () => {
  it("renders nothing when there are no actions", () => {
    const { container } = renderActions([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("simple-confirm action posts to /actions/execute and reports success", async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    server.use(
      http.post("/api/copilot/actions/execute", async ({ request }) => {
        const body = await request.json() as { tool: string; args: Record<string, unknown> };
        return HttpResponse.json({ tool: body.tool, status: "frontend_handled", result: { path: body.args.path } });
      }),
    );
    renderActions(
      [{ tool: "navigate", args: { path: "/checkpoint-3" }, confirm_token: null, consequence: "Open /checkpoint-3" }],
      onResult,
    );

    const card = screen.getByTestId("proposed-action-navigate");
    expect(within(card).getByText(/Open \/checkpoint-3/)).toBeInTheDocument();
    await user.click(within(card).getByTestId("proposed-action-navigate-confirm"));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("0:navigate", "confirmed"));
    // SPA hop happened.
    expect(await screen.findByTestId("cp3-landed")).toBeInTheDocument();
  });

  it("typed-token action requires the exact case-sensitive token before posting", async () => {
    const user = userEvent.setup();
    const calls: unknown[] = [];
    server.use(
      http.post("/api/copilot/actions/execute", async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({ tool: "halt_campaign", status: "ok", result: { halt_id: "h-1" } });
      }),
    );
    const onResult = vi.fn();
    renderActions(
      [{ tool: "halt_campaign", args: { client_id: "c-1", detail: "spike" }, confirm_token: "HALT", consequence: "Halt campaign for c-1." }],
      onResult,
    );

    await user.click(screen.getByTestId("proposed-action-halt_campaign-confirm"));
    const modal = await screen.findByRole("dialog", { name: /confirm: halt campaign/i });
    const confirmBtn = within(modal).getByTestId("typed-confirm-button");
    expect(confirmBtn).toBeDisabled();

    await user.type(within(modal).getByLabelText(/Type HALT to confirm/i), "halt");
    expect(confirmBtn).toBeDisabled();
    await user.clear(within(modal).getByLabelText(/Type HALT to confirm/i));
    await user.type(within(modal).getByLabelText(/Type HALT to confirm/i), "HALT");
    expect(confirmBtn).toBeEnabled();
    await user.click(confirmBtn);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect((calls[0] as { confirmation: string }).confirmation).toBe("HALT");
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("0:halt_campaign", "confirmed"));
  });

  it("surfaces backend errors inline without marking the action confirmed", async () => {
    const user = userEvent.setup();
    server.use(
      http.post("/api/copilot/actions/execute", () =>
        HttpResponse.json({ detail: "halt not found" }, { status: 404 }),
      ),
    );
    const onResult = vi.fn();
    renderActions(
      [{ tool: "navigate", args: { path: "/x" }, confirm_token: null, consequence: "Open /x" }],
      onResult,
    );
    await user.click(screen.getByTestId("proposed-action-navigate-confirm"));
    expect(await screen.findByText(/halt not found/i)).toBeInTheDocument();
    expect(onResult).toHaveBeenCalledWith("0:navigate", "error");
  });

  it("Cancel button reports cancelled without posting", async () => {
    const user = userEvent.setup();
    let posted = false;
    server.use(
      http.post("/api/copilot/actions/execute", () => {
        posted = true;
        return HttpResponse.json({});
      }),
    );
    const onResult = vi.fn();
    renderActions(
      [{ tool: "navigate", args: { path: "/x" }, confirm_token: null, consequence: "Open /x" }],
      onResult,
    );
    await user.click(within(screen.getByTestId("proposed-action-navigate")).getByText("Cancel"));
    expect(onResult).toHaveBeenCalledWith("0:navigate", "cancelled");
    expect(posted).toBe(false);
  });
});
