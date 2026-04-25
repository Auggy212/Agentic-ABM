import { describe, it, expect } from "vitest";
import { gtmSchema } from "../steps/GTMStep";

const VALID = {
  competitors:  [{ name: "6sense", weaknesses: ["expensive"] }],
  win_themes:   ["ROI in 90 days"],
  loss_themes:  ["budget"],
  channels:     ["LinkedIn"],
  crm:          "HubSpot" as const,
  existing_account_list: null,
};

describe("gtmSchema", () => {
  it("accepts valid data", () => {
    expect(gtmSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects empty competitors array", () => {
    const r = gtmSchema.safeParse({ ...VALID, competitors: [] });
    expect(r.success).toBe(false);
  });

  it("rejects competitor with no weaknesses", () => {
    const r = gtmSchema.safeParse({
      ...VALID,
      competitors: [{ name: "Comp", weaknesses: [] }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty competitor name", () => {
    const r = gtmSchema.safeParse({
      ...VALID,
      competitors: [{ name: "", weaknesses: ["x"] }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty win_themes", () => {
    const r = gtmSchema.safeParse({ ...VALID, win_themes: [] });
    expect(r.success).toBe(false);
  });

  it("rejects empty channels", () => {
    const r = gtmSchema.safeParse({ ...VALID, channels: [] });
    expect(r.success).toBe(false);
  });

  it("rejects invalid CRM", () => {
    const r = gtmSchema.safeParse({ ...VALID, crm: "Pipedrive" });
    expect(r.success).toBe(false);
  });

  it("accepts null existing_account_list", () => {
    expect(gtmSchema.safeParse({ ...VALID, existing_account_list: null }).success).toBe(true);
  });

  it("accepts a string existing_account_list", () => {
    expect(gtmSchema.safeParse({ ...VALID, existing_account_list: "uploaded_123.csv" }).success).toBe(true);
  });
});
