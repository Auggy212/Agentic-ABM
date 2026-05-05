import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TypedConfirmationModal from "@/components/ui/TypedConfirmationModal";

function setup(overrides: Partial<React.ComponentProps<typeof TypedConfirmationModal>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const props = {
    open: true,
    title: "Resume campaign?",
    consequence: "Resuming will continue sends to 234 recipients across 47 accounts.",
    confirmationText: "RESUME",
    onConfirm,
    onCancel,
    ...overrides,
  };
  render(<TypedConfirmationModal {...props} />);
  return { onConfirm, onCancel };
}

describe("TypedConfirmationModal", () => {
  it("renders the consequence text and disabled confirm by default", () => {
    setup();
    expect(screen.getByText(/Resuming will continue sends/)).toBeInTheDocument();
    expect(screen.getByTestId("typed-confirm-button")).toBeDisabled();
  });

  it("rejects lowercase, capitalised, and whitespace variants of the token", async () => {
    const user = userEvent.setup();
    setup();
    const input = screen.getByLabelText(/type RESUME to confirm/i);
    const confirm = screen.getByTestId("typed-confirm-button");

    for (const bad of ["resume", "Resume", " RESUME", "RESUME ", "RESUMED"]) {
      await user.clear(input);
      await user.type(input, bad);
      expect(confirm).toBeDisabled();
    }
  });

  it("enables confirm only when input matches exactly", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup();
    const input = screen.getByLabelText(/type RESUME to confirm/i);
    const confirm = screen.getByTestId("typed-confirm-button");

    await user.type(input, "RESUME");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith("RESUME");
  });

  it("calls onCancel when the cancel button is clicked", async () => {
    const user = userEvent.setup();
    const { onCancel } = setup();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("respects a custom confirmationText (e.g. ESCALATE) and is still case-sensitive", async () => {
    const user = userEvent.setup();
    setup({ confirmationText: "ESCALATE", title: "Escalate overdue handoffs?" });
    const input = screen.getByLabelText(/type ESCALATE to confirm/i);
    const confirm = screen.getByTestId("typed-confirm-button");

    await user.type(input, "escalate");
    expect(confirm).toBeDisabled();
    await user.clear(input);
    await user.type(input, "ESCALATE");
    expect(confirm).toBeEnabled();
  });
});
