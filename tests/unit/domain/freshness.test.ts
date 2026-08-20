import { describe, expect, it } from "vitest";
import { computeFreshness } from "@/domain/freshness";

/** openspec: pantry-freshness — day-granular age + expiry classification. */
const NOW = new Date("2026-08-20T18:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe("computeFreshness", () => {
  it("no shelf life: age only, always fresh", () => {
    expect(computeFreshness(daysAgo(5), null, NOW)).toEqual({
      daysSinceStocked: 5,
      daysLeft: null,
      status: "fresh",
    });
  });

  it("milk at day 12 of 14 is expiring with ~2 days left", () => {
    expect(computeFreshness(daysAgo(12), 14, NOW)).toEqual({
      daysSinceStocked: 12,
      daysLeft: 2,
      status: "expiring",
    });
  });

  it("well within shelf life is fresh", () => {
    expect(computeFreshness(daysAgo(2), 14, NOW)!.status).toBe("fresh");
  });

  it("past the estimate is expired", () => {
    expect(computeFreshness(daysAgo(15), 14, NOW)!.status).toBe("expired");
  });

  it("boundary: exactly 3 days left is expiring; exactly 0 left is expiring; -1 expired", () => {
    expect(computeFreshness(daysAgo(11), 14, NOW)!.status).toBe("expiring");
    expect(computeFreshness(daysAgo(14), 14, NOW)!.status).toBe("expiring");
    expect(computeFreshness(daysAgo(15), 14, NOW)!.status).toBe("expired");
  });

  it("partial days floor (36h ago = 1 day)", () => {
    expect(computeFreshness(new Date(NOW.getTime() - 36 * 3_600_000).toISOString(), null, NOW)!.daysSinceStocked).toBe(1);
  });

  it("null or garbage stockedAt yields null", () => {
    expect(computeFreshness(null, 14, NOW)).toBeNull();
    expect(computeFreshness("not-a-date", 14, NOW)).toBeNull();
  });
});
