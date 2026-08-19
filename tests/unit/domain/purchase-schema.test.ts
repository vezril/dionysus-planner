import { describe, expect, it } from "vitest";
import { purchaseSchema } from "@/domain/validation/purchase.schema";

function valid(overrides: Record<string, unknown> = {}) {
  return { ingredientId: 1, price: 4.99, purchasedAt: "2026-08-19", ...overrides };
}

describe("domain/validation/purchase.schema", () => {
  it("accepts a price-only purchase", () => {
    expect(purchaseSchema.safeParse(valid()).success).toBe(true);
  });

  it("accepts a full purchase (store + quantity + unit)", () => {
    const result = purchaseSchema.safeParse(
      valid({ store: "Metro", displayQuantity: 1, displayUnit: "kg" }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a missing price", () => {
    const input = valid();
    delete (input as Record<string, unknown>).price;
    expect(purchaseSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a negative price", () => {
    expect(purchaseSchema.safeParse(valid({ price: -1 })).success).toBe(false);
  });

  it("accepts price 0 (freebies happen)", () => {
    expect(purchaseSchema.safeParse(valid({ price: 0 })).success).toBe(true);
  });

  it("rejects a quantity without a unit", () => {
    const result = purchaseSchema.safeParse(valid({ displayQuantity: 1 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("displayUnit");
    }
  });

  it("accepts a unit without a quantity (harmless, ignored)", () => {
    expect(purchaseSchema.safeParse(valid({ displayUnit: "kg" })).success).toBe(true);
  });

  it("rejects a zero or negative quantity", () => {
    expect(purchaseSchema.safeParse(valid({ displayQuantity: 0, displayUnit: "kg" })).success).toBe(false);
    expect(purchaseSchema.safeParse(valid({ displayQuantity: -1, displayUnit: "kg" })).success).toBe(false);
  });

  it("rejects a blank store (whitespace-only)", () => {
    expect(purchaseSchema.safeParse(valid({ store: "   " })).success).toBe(false);
  });

  it("accepts store null/undefined", () => {
    expect(purchaseSchema.safeParse(valid({ store: null })).success).toBe(true);
    expect(purchaseSchema.safeParse(valid({ store: undefined })).success).toBe(true);
  });

  it("rejects a malformed purchasedAt", () => {
    expect(purchaseSchema.safeParse(valid({ purchasedAt: "19/08/2026" })).success).toBe(false);
  });

  it("rejects an impossible calendar date that matches the shape (2026-02-31)", () => {
    expect(purchaseSchema.safeParse(valid({ purchasedAt: "2026-02-31" })).success).toBe(false);
  });

  it("rejects a non-positive ingredientId", () => {
    expect(purchaseSchema.safeParse(valid({ ingredientId: 0 })).success).toBe(false);
  });
});
