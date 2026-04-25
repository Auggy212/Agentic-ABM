import { describe, it, expect, beforeEach } from "vitest";
import { icpSchema } from "../steps/ICPStep";
import { useIntakeStore } from "@/store/intakeStore";

const VALID_ICP = {
  icp_industries:           ["SaaS"],
  company_size_employees:   "100-500",
  company_size_arr:         "$5M-$50M",
  funding_stage:            ["Series A"],
  geographies:              ["USA"],
  tech_stack_signals:       [],
  buying_triggers:          ["new VP hire"],
  negative_icp:             [],
  negative_icp_confirmed_empty: true, // explicit confirmation
};

describe("icpSchema", () => {
  it("accepts valid data with confirmed empty negative_icp", () => {
    expect(icpSchema.safeParse(VALID_ICP).success).toBe(true);
  });

  it("accepts valid data with entries in negative_icp and confirmed false", () => {
    const result = icpSchema.safeParse({
      ...VALID_ICP,
      negative_icp: ["acme.com"],
      negative_icp_confirmed_empty: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects null negative_icp_confirmed_empty (not yet chosen)", () => {
    const result = icpSchema.safeParse({
      ...VALID_ICP,
      negative_icp_confirmed_empty: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects confirmed_empty=false with an empty list", () => {
    const result = icpSchema.safeParse({
      ...VALID_ICP,
      negative_icp: [],
      negative_icp_confirmed_empty: false,
    });
    expect(result.success).toBe(false);
    const issues = !result.success ? result.error.issues : [];
    expect(issues.some((i) => i.path.includes("negative_icp"))).toBe(true);
  });

  it("rejects empty industries array", () => {
    const result = icpSchema.safeParse({ ...VALID_ICP, icp_industries: [] });
    expect(result.success).toBe(false);
  });

  it("rejects industries array with more than 5 items", () => {
    const result = icpSchema.safeParse({
      ...VALID_ICP,
      icp_industries: ["A", "B", "C", "D", "E", "F"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid employee range format", () => {
    const result = icpSchema.safeParse({
      ...VALID_ICP,
      company_size_employees: "hundred to five hundred",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty buying_triggers", () => {
    const result = icpSchema.safeParse({ ...VALID_ICP, buying_triggers: [] });
    expect(result.success).toBe(false);
  });

  it("rejects empty geographies", () => {
    const result = icpSchema.safeParse({ ...VALID_ICP, geographies: [] });
    expect(result.success).toBe(false);
  });

  it("rejects empty funding_stage", () => {
    const result = icpSchema.safeParse({ ...VALID_ICP, funding_stage: [] });
    expect(result.success).toBe(false);
  });
});

// ── Negative ICP store tests ──────────────────────────────────────────────────

describe("NegativeICP store — critical field", () => {
  beforeEach(() => useIntakeStore.getState().reset());

  it("initialises with null (neither choice made)", () => {
    expect(useIntakeStore.getState().formData.negative_icp_confirmed_empty).toBeNull();
  });

  it("can be set to true (no exclusions)", () => {
    useIntakeStore.getState().setField("negative_icp_confirmed_empty", true);
    expect(useIntakeStore.getState().formData.negative_icp_confirmed_empty).toBe(true);
  });

  it("can be set to false (has exclusions)", () => {
    useIntakeStore.getState().setField("negative_icp_confirmed_empty", false);
    expect(useIntakeStore.getState().formData.negative_icp_confirmed_empty).toBe(false);
  });

  it("resets back to null after store reset", () => {
    useIntakeStore.getState().setField("negative_icp_confirmed_empty", true);
    useIntakeStore.getState().reset();
    expect(useIntakeStore.getState().formData.negative_icp_confirmed_empty).toBeNull();
  });
});
