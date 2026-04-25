import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClarifyingQuestionsModal from "../ClarifyingQuestionsModal";
import type { ClarifyingQuestion } from "@/lib/api";

const QUESTIONS: ClarifyingQuestion[] = [
  {
    field: "company.value_prop",
    question: "Can you describe the specific outcome customers achieve?",
  },
  {
    field: "icp.buying_triggers",
    question: "Give 2–3 concrete events that signal a company is ready to buy.",
  },
];

function renderModal(overrides: Partial<Parameters<typeof ClarifyingQuestionsModal>[0]> = {}) {
  const onClose      = vi.fn();
  const onSubmit     = vi.fn();
  const isSubmitting = false;

  render(
    <ClarifyingQuestionsModal
      open={true}
      onClose={onClose}
      questions={QUESTIONS}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      {...overrides}
    />
  );

  return { onClose, onSubmit };
}

describe("ClarifyingQuestionsModal", () => {
  it("renders all questions", () => {
    renderModal();
    expect(
      screen.getByText(/Can you describe the specific outcome/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2–3 concrete events/i)
    ).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    render(
      <ClarifyingQuestionsModal
        open={false}
        onClose={vi.fn()}
        questions={QUESTIONS}
        onSubmit={vi.fn()}
        isSubmitting={false}
      />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("formats field paths for display", () => {
    renderModal();
    expect(screen.getByText(/Company › Value Prop/i)).toBeInTheDocument();
  });

  it("submit button is disabled until all answers filled", () => {
    renderModal();
    const submitBtn = screen.getByRole("button", { name: /submit answers/i });
    expect(submitBtn).toBeDisabled();
  });

  it("submit button enables after all answers filled", async () => {
    renderModal();
    const textareas = screen.getAllByRole("textbox");
    await userEvent.type(textareas[0], "Detailed answer for value prop");
    await userEvent.type(textareas[1], "Detailed answer for triggers");
    const submitBtn = screen.getByRole("button", { name: /submit answers/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it("calls onSubmit with answers map on submit", async () => {
    const { onSubmit } = renderModal();
    const textareas = screen.getAllByRole("textbox");
    await userEvent.type(textareas[0], "Answer one");
    await userEvent.type(textareas[1], "Answer two");
    await userEvent.click(screen.getByRole("button", { name: /submit answers/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      "company.value_prop":    "Answer one",
      "icp.buying_triggers":   "Answer two",
    });
  });

  it("calls onClose when 'Back to form' is clicked", async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: /back to form/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("shows required error on unanswered questions", async () => {
    renderModal();
    const textareas = screen.getAllByRole("textbox");
    await userEvent.type(textareas[0], "First answer");
    // Second textarea left empty — error should show
    const errors = screen.getAllByText(/this answer is required/i);
    // At least one textarea has the error (for the unanswered one)
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});
