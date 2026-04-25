import { describe, it, expect, beforeEach } from "vitest";
import { companySchema } from "../steps/CompanyStep";
import { useIntakeStore } from "@/store/intakeStore";

// ── Schema unit tests ─────────────────────────────────────────────────────────

describe("companySchema", () => {
  it("accepts valid data", () => {
    const result = companySchema.safeParse({
      company_name:        "Acme AI",
      website:             "https://acme.ai",
      industry:            "SaaS",
      stage:               "Series A",
      product:             "AI ABM platform",
      value_prop:          "We help Series B SaaS companies cut manual prospecting by 80 percent using real-time buyer intent signals and AI-driven account scoring.",
      differentiators:     ["real-time signals"],
      pricing_model:       "Subscription",
      acv_range:           "$20k-$80k",
      reference_customers: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing company_name", () => {
    const result = companySchema.safeParse({
      company_name: "",
      website: "https://acme.ai",
      industry: "SaaS",
      stage: "Series A",
      product: "Product",
      value_prop: "We help companies achieve outcomes through mechanisms so they can benefit greatly.",
      differentiators: ["x"],
      pricing_model: "Subscription",
      acv_range: "$10k",
      reference_customers: [],
    });
    expect(result.success).toBe(false);
    const issues = !result.success ? result.error.issues : [];
    expect(issues.some((i) => i.path[0] === "company_name")).toBe(true);
  });

  it("rejects invalid website URL", () => {
    const result = companySchema.safeParse({
      company_name: "Acme",
      website: "not-a-url",
      industry: "SaaS",
      stage: "Series A",
      product: "Product",
      value_prop: "We help companies achieve outcomes through mechanisms so they can benefit greatly.",
      differentiators: ["x"],
      pricing_model: "Subscription",
      acv_range: "$10k",
      reference_customers: [],
    });
    expect(result.success).toBe(false);
    const issues = !result.success ? result.error.issues : [];
    expect(issues.some((i) => i.path[0] === "website")).toBe(true);
  });

  it("rejects value_prop under 15 words", () => {
    const result = companySchema.safeParse({
      company_name: "Acme",
      website: "https://acme.ai",
      industry: "SaaS",
      stage: "Series A",
      product: "Product",
      value_prop: "Too short",
      differentiators: ["x"],
      pricing_model: "Subscription",
      acv_range: "$10k",
      reference_customers: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty differentiators array", () => {
    const result = companySchema.safeParse({
      company_name: "Acme",
      website: "https://acme.ai",
      industry: "SaaS",
      stage: "Series A",
      product: "Product",
      value_prop: "We help companies achieve outcomes through mechanisms so they can benefit greatly.",
      differentiators: [],
      pricing_model: "Subscription",
      acv_range: "$10k",
      reference_customers: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid pricing_model enum", () => {
    const result = companySchema.safeParse({
      company_name: "Acme",
      website: "https://acme.ai",
      industry: "SaaS",
      stage: "Series A",
      product: "Product",
      value_prop: "We help companies achieve outcomes through mechanisms so they can benefit greatly.",
      differentiators: ["x"],
      pricing_model: "Freemium", // not in enum
      acv_range: "$10k",
      reference_customers: [],
    });
    expect(result.success).toBe(false);
  });
});

// ── Store tests ───────────────────────────────────────────────────────────────

describe("IntakeStore — step 1 fields", () => {
  beforeEach(() => useIntakeStore.getState().reset());

  it("updates company_name via setField", () => {
    useIntakeStore.getState().setField("company_name", "Test Corp");
    expect(useIntakeStore.getState().formData.company_name).toBe("Test Corp");
  });

  it("marks isDirty when field changes", () => {
    expect(useIntakeStore.getState().isDirty).toBe(false);
    useIntakeStore.getState().setField("company_name", "Dirty Corp");
    expect(useIntakeStore.getState().isDirty).toBe(true);
  });

  it("resets store to initial state", () => {
    useIntakeStore.getState().setField("company_name", "Some Corp");
    useIntakeStore.getState().reset();
    expect(useIntakeStore.getState().formData.company_name).toBe("");
    expect(useIntakeStore.getState().isDirty).toBe(false);
  });
});
