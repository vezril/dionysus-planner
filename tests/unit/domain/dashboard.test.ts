import { describe, expect, it } from "vitest";
import { alcoholUnitsFromGrams } from "@/domain/abv";
import { periodRange, shiftAnchor } from "@/domain/periods";

/** openspec: consumption-dashboard — CRDM units + period math. */
describe("alcoholUnitsFromGrams (CRDM)", () => {
  it("a 355 mL 5% beer (14.00475 g) is 1.04 units", () => {
    expect(alcoholUnitsFromGrams(355 * 0.05 * 0.789)).toBe(1.04);
  });

  it("zero is zero", () => {
    expect(alcoholUnitsFromGrams(0)).toBe(0);
  });
});

describe("periodRange", () => {
  it("day, week (Mon..Sun), month, year", () => {
    expect(periodRange("day", "2026-08-20")).toMatchObject({ from: "2026-08-20", to: "2026-08-20" });
    expect(periodRange("week", "2026-08-20")).toMatchObject({ from: "2026-08-17", to: "2026-08-23" });
    expect(periodRange("month", "2026-08-20")).toMatchObject({ from: "2026-08-01", to: "2026-08-31" });
    expect(periodRange("month", "2026-02-10")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("year", "2026-08-20")).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
  });
});

describe("shiftAnchor", () => {
  it("shifts by the period size, including month-end clamping", () => {
    expect(shiftAnchor("day", "2026-08-20", -1)).toBe("2026-08-19");
    expect(shiftAnchor("week", "2026-08-20", 1)).toBe("2026-08-27");
    expect(shiftAnchor("month", "2026-08-20", 1)).toBe("2026-09-01");
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("year", "2026-08-20", -1)).toBe("2025-01-01");
  });
});
