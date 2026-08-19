import { describe, expect, it } from "vitest";
import { computePriceStats } from "@/domain/priceStats";

describe("domain/priceStats", () => {
  it("returns null for an empty history (page shows an empty state, never zeros)", () => {
    expect(computePriceStats([])).toBeNull();
  });

  it("computes last paid and lowest from the spec scenario", () => {
    // 5.99 (2026-08-01, Metro) and 4.49 (2026-08-15, Maxi) -> last 4.49, lowest 4.49 @ Maxi
    const stats = computePriceStats([
      { price: 4.49, store: "Maxi", purchasedAt: "2026-08-15" },
      { price: 5.99, store: "Metro", purchasedAt: "2026-08-01" },
    ]);
    expect(stats).toEqual({ lastPaid: 4.49, lowest: { price: 4.49, store: "Maxi" } });
  });

  it("last paid follows the most recent date even when it is not the lowest", () => {
    const stats = computePriceStats([
      { price: 4.49, store: "Maxi", purchasedAt: "2026-08-01" },
      { price: 6.99, store: "Metro", purchasedAt: "2026-08-15" },
    ]);
    expect(stats?.lastPaid).toBe(6.99);
    expect(stats?.lowest).toEqual({ price: 4.49, store: "Maxi" });
  });

  it("lowest carries a null store when the cheapest purchase had none recorded", () => {
    const stats = computePriceStats([
      { price: 3.99, store: null, purchasedAt: "2026-08-02" },
      { price: 5.99, store: "Metro", purchasedAt: "2026-08-01" },
    ]);
    expect(stats?.lowest).toEqual({ price: 3.99, store: null });
  });

  it("is order-independent", () => {
    const a = computePriceStats([
      { price: 5.99, store: "Metro", purchasedAt: "2026-08-01" },
      { price: 4.49, store: "Maxi", purchasedAt: "2026-08-15" },
    ]);
    const b = computePriceStats([
      { price: 4.49, store: "Maxi", purchasedAt: "2026-08-15" },
      { price: 5.99, store: "Metro", purchasedAt: "2026-08-01" },
    ]);
    expect(a).toEqual(b);
  });
});
