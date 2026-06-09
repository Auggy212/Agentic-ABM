import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NegativeICPField from "../fields/NegativeICPField";
import { useIntakeStore } from "@/store/intakeStore";

function renderField(props: { error?: string; confirmationError?: string } = {}) {
  return render(<NegativeICPField {...props} />);
}

describe("NegativeICPField", () => {
  beforeEach(() => useIntakeStore.getState().reset());

  it("renders both radio options", () => {
    renderField();
    expect(screen.getByText(/I have accounts to exclude/i)).toBeInTheDocument();
    expect(screen.getByText(/I have no accounts to exclude/i)).toBeInTheDocument();
  });

  it("neither radio is checked on first render (null state)", () => {
    renderField();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    radios.forEach((r) => expect(r).not.toBeChecked());
  });

  it("selecting 'no exclusions' checks the second radio", async () => {
    renderField();
    const radios = screen.getAllByRole("radio");
    await userEvent.click(radios[1]); // second = "no exclusions"
    expect(useIntakeStore.getState().formData.negative_icp_confirmed_empty).toBe(true);
  });

  it("selecting 'has exclusions' checks the first radio", async () => {
    renderField();
    const radios = screen.getAllByRole("radio");
    await userEvent.click(radios[0]); // first = "has exclusions"
    expect(useIntakeStore.getState().formData.negative_icp_confirmed_empty).toBe(false);
  });

  it("disables tag input when 'no exclusions' is selected", async () => {
    renderField();
    const radios = screen.getAllByRole("radio");
    await userEvent.click(radios[1]);
    // The input inside TagInput should be disabled
    const inputs = screen.getAllByRole("textbox");
    const tagInput = inputs[inputs.length - 1];
    expect(tagInput).toBeDisabled();
  });

  it("shows confirmationError when passed", () => {
    renderField({ confirmationError: "You must make an explicit choice" });
    // Error only shows when null state — need to leave at null
    expect(
      screen.getByText(/You must make an explicit choice/i)
    ).toBeInTheDocument();
  });

  it("shows inline error when 'has exclusions' chosen but list is empty", async () => {
    renderField();
    const radios = screen.getAllByRole("radio");
    await userEvent.click(radios[0]);
    expect(
      screen.getByText(/the list is empty/i)
    ).toBeInTheDocument();
  });

  it("does not show the empty-list error when exclusions are present", async () => {
    useIntakeStore.getState().setField("negative_icp", ["acme.com"]);
    renderField();
    const radios = screen.getAllByRole("radio");
    await userEvent.click(radios[0]);
    expect(
      screen.queryByText(/the list is empty/i)
    ).not.toBeInTheDocument();
  });

  it("selecting 'no exclusions' clears the negative_icp list", async () => {
    useIntakeStore.getState().setField("negative_icp", ["acme.com", "beta.io"]);
    renderField();
    const radios = screen.getAllByRole("radio");
    await userEvent.click(radios[1]);
    expect(useIntakeStore.getState().formData.negative_icp).toHaveLength(0);
  });
});
