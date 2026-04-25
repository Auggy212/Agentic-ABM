import { describe, it, expect } from "vitest";
import { buyersSchema } from "../steps/BuyersStep";

const VALID = {
  titles:                ["VP Sales", "CRO"],
  seniority:             ["VP"],
  buying_committee_size: "3-5",
  pain_points:           ["manual prospecting is slow"],
  unstated_needs:        [],
};

describe("buyersSchema", () => {
  it("accepts valid data", () => {
    expect(buyersSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects empty titles", () => {
    const r = buyersSchema.safeParse({ ...VALID, titles: [] });
    expect(r.success).toBe(false);
  });

  it("rejects empty seniority", () => {
    const r = buyersSchema.safeParse({ ...VALID, seniority: [] });
    expect(r.success).toBe(false);
  });

  it("rejects missing buying_committee_size", () => {
    const r = buyersSchema.safeParse({ ...VALID, buying_committee_size: "" });
    expect(r.success).toBe(false);
  });

  it("rejects empty pain_points", () => {
    const r = buyersSchema.safeParse({ ...VALID, pain_points: [] });
    expect(r.success).toBe(false);
  });

  it("allows empty unstated_needs", () => {
    expect(buyersSchema.safeParse({ ...VALID, unstated_needs: [] }).success).toBe(true);
  });
});
