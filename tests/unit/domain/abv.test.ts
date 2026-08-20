import { describe, expect, it } from "vitest";
import { computeRecipeAbv } from "@/domain/abv";

/** openspec: drinks-and-abv — the cocktail estimate. */

const vodka = {
  unitClass: "VOLUME" as const,
  densityGPerMl: null,
  alcoholGPerRef: 31.6, // ~40% ABV spirit per 100 mL
};
const juice = { unitClass: "VOLUME" as const, densityGPerMl: null, alcoholGPerRef: null };

function line(quantityCanonical: number, ingredient: (typeof vodka | typeof juice) & Record<string, unknown>) {
  return { quantityCanonical, entryUnitClass: "VOLUME" as const, ingredient };
}

describe("computeRecipeAbv", () => {
  it("screwdriver: 45 mL vodka + 120 mL juice ≈ 10.9% ABV", () => {
    const result = computeRecipeAbv([line(45, vodka), line(120, juice)]);
    expect(result).not.toBeNull();
    // alcohol = 45/100 × 31.6 = 14.22 g → 18.02 mL ethanol / 165 mL total
    expect(result!.abvPercent).toBeCloseTo((14.22 / 0.789 / 165) * 100, 3);
  });

  it("unrecorded alcohol counts as zero, not a blocker", () => {
    const result = computeRecipeAbv([line(45, vodka), line(120, juice)]);
    expect(result!.totalAlcoholG).toBeCloseTo(14.22, 10);
  });

  it("a COUNT line of a packaged drink contributes via the package bridge", () => {
    const beer = {
      unitClass: "VOLUME" as const,
      densityGPerMl: null,
      packageQuantity: 355,
      packageUnit: "mL",
      alcoholGPerRef: 3.94, // per 100 mL
    };
    const result = computeRecipeAbv([
      { quantityCanonical: 1, entryUnitClass: "COUNT" as const, ingredient: beer },
    ]);
    // 355 mL, alcohol 3.55 × 3.94 = 13.987 g
    expect(result!.totalVolumeMl).toBe(355);
    expect(result!.totalAlcoholG).toBeCloseTo(13.987, 3);
  });

  it("MASS lines join the volume via density; unresolvable mass adds no volume", () => {
    const syrup = { unitClass: "MASS" as const, densityGPerMl: 1.3, alcoholGPerRef: null };
    const sugar = { unitClass: "MASS" as const, densityGPerMl: null, alcoholGPerRef: null };
    const withDensity = computeRecipeAbv([line(45, vodka), { quantityCanonical: 13, entryUnitClass: "MASS" as const, ingredient: syrup }]);
    expect(withDensity!.totalVolumeMl).toBe(55); // 45 + 13/1.3
    const withoutDensity = computeRecipeAbv([line(45, vodka), { quantityCanonical: 13, entryUnitClass: "MASS" as const, ingredient: sugar }]);
    expect(withoutDensity!.totalVolumeMl).toBe(45);
  });

  it("no alcohol → null; no volume → null", () => {
    expect(computeRecipeAbv([line(120, juice)])).toBeNull();
    const spirit = { unitClass: "MASS" as const, densityGPerMl: null, alcoholGPerRef: 10 };
    expect(computeRecipeAbv([{ quantityCanonical: 50, entryUnitClass: "MASS" as const, ingredient: spirit }])).toBeNull();
  });
});
