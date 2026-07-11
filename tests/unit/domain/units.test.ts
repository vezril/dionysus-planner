import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  UNITS,
  toCanonical,
  resolveQuantityForComparison,
  type UnitClass,
} from "@/domain/units";

/**
 * S-102: domain units & conversion engine.
 *
 * Traces to docs/stories/S-102-domain-units.md AC1-AC7 and
 * architecture.md §4 ("Unit / UnitClass" code constant, "Canonical-unit
 * & density strategy"). Covers FR-9, FR-10, FR-11, FR-12, NFR-7.
 *
 * `domain/units.ts` is currently a placeholder (S-101 scaffold export
 * `PLACEHOLDER_UNIT_CLASSES` / `isKnownUnitClass`) — this suite is
 * intentionally red until the implementer builds the real `UNITS`
 * table, `toCanonical()`, and `resolveQuantityForComparison()` per
 * architecture.md §4.
 */

/** Relative-tolerance assertion: |actual - expected| / |expected| <= tolerance. */
function expectWithinRelativeTolerance(
  actual: number,
  expected: number,
  tolerance: number,
) {
  const relativeError = Math.abs(actual - expected) / Math.abs(expected);
  expect(
    relativeError,
    `expected ${actual} to be within ${tolerance * 100}% of ${expected} (relative error was ${(relativeError * 100).toFixed(3)}%)`,
  ).toBeLessThanOrEqual(tolerance);
}

/** FR-10's stated unit set and US-customary factors, verbatim from the PRD / architecture §4 code constant. */
const EXPECTED_UNITS: Record<string, { class: UnitClass; factor: number }> = {
  g: { class: "MASS", factor: 1 },
  kg: { class: "MASS", factor: 1000 },
  oz: { class: "MASS", factor: 28.3495 },
  lb: { class: "MASS", factor: 453.592 },
  mL: { class: "VOLUME", factor: 1 },
  L: { class: "VOLUME", factor: 1000 },
  tsp: { class: "VOLUME", factor: 5 },
  tbsp: { class: "VOLUME", factor: 15 },
  cup: { class: "VOLUME", factor: 240 },
  floz: { class: "VOLUME", factor: 29.57 },
  each: { class: "COUNT", factor: 1 },
};

const FR10_TOLERANCE = 0.01; // NFR-7: same-class conversions carry <=1% relative error
const FR12_TOLERANCE = 0.05; // FR-12: density-based cross-class conversion, 5% end-to-end tolerance

describe("domain/units — UNITS table (AC1, FR-10)", () => {
  it("contains exactly the FR-10 unit set (no more, no fewer)", () => {
    expect(Object.keys(UNITS).sort()).toEqual(
      Object.keys(EXPECTED_UNITS).sort(),
    );
  });

  it.each(Object.entries(EXPECTED_UNITS))(
    "%s: has class %s and toCanonicalFactor within 1%% of the stated definition",
    (unit, expected) => {
      const entry = UNITS[unit];
      expect(entry, `UNITS['${unit}'] should exist`).toBeDefined();
      expect(entry.class).toBe(expected.class);
      expectWithinRelativeTolerance(
        entry.toCanonicalFactor,
        expected.factor,
        FR10_TOLERANCE,
      );
    },
  );

  it("groups units into exactly Mass={g,kg,oz,lb}, Volume={mL,L,tsp,tbsp,cup,floz}, Count={each}", () => {
    const byClass: Record<UnitClass, string[]> = {
      MASS: [],
      VOLUME: [],
      COUNT: [],
    };
    for (const [unit, def] of Object.entries(UNITS)) {
      byClass[def.class].push(unit);
    }
    expect(byClass.MASS.sort()).toEqual(["g", "kg", "lb", "oz"]);
    expect(byClass.VOLUME.sort()).toEqual([
      "L",
      "cup",
      "floz",
      "mL",
      "tbsp",
      "tsp",
    ]);
    expect(byClass.COUNT.sort()).toEqual(["each"]);
  });
});

describe("domain/units — toCanonical() (AC2, AC3, FR-9)", () => {
  it("converts 2 lb to ~907.184 g canonical, class MASS", () => {
    const result = toCanonical(2, "lb");
    expectWithinRelativeTolerance(
      result.quantityCanonical,
      907.184,
      FR10_TOLERANCE,
    );
    expect(result.entryUnitClass).toBe("MASS");
  });

  it("converts 1 cup to 240 mL canonical, class VOLUME", () => {
    const result = toCanonical(1, "cup");
    expectWithinRelativeTolerance(result.quantityCanonical, 240, FR10_TOLERANCE);
    expect(result.entryUnitClass).toBe("VOLUME");
  });

  it("converts 3 each to 3 canonical, class COUNT", () => {
    const result = toCanonical(3, "each");
    expect(result.quantityCanonical).toBe(3);
    expect(result.entryUnitClass).toBe("COUNT");
  });

  it("rejects an unknown unit rather than silently guessing", () => {
    expect(() => toCanonical(5, "bogus-unit")).toThrow();
  });

  it("returns exactly { quantityCanonical, entryUnitClass } — no extra or missing fields", () => {
    const result = toCanonical(2, "lb");
    expect(Object.keys(result).sort()).toEqual([
      "entryUnitClass",
      "quantityCanonical",
    ]);
  });

  it("is pure: does not mutate its inputs and is deterministic across repeated calls", () => {
    const qty = 2;
    const unit = "lb";
    const first = toCanonical(qty, unit);
    const second = toCanonical(qty, unit);
    expect(qty).toBe(2);
    expect(unit).toBe("lb");
    expect(second).toEqual(first);
  });

  it("preserves entry precision through canonical without lossy rounding (FR-9 exact-redisplay contract)", () => {
    // 1/3 cup = 80 mL exactly; converting back via the unit's own factor
    // must recover 1/3 within 1%, i.e. toCanonical must not have rounded
    // the canonical value to a coarse display precision.
    const result = toCanonical(1 / 3, "cup");
    expectWithinRelativeTolerance(result.quantityCanonical, 80, FR10_TOLERANCE);
    const recoveredCupQuantity = result.quantityCanonical / UNITS.cup.toCanonicalFactor;
    expectWithinRelativeTolerance(recoveredCupQuantity, 1 / 3, FR10_TOLERANCE);
  });
});

describe("domain/units — same-class round-trip conversions stay within 1% (AC2, FR-10)", () => {
  const explicitHandComputedCases: Array<
    [quantity: number, fromUnit: string, toUnit: string, expected: number]
  > = [
    // 2 lb -> g
    [2, "lb", "g", 907.184],
    // 2 cups -> tbsp (2 * 240 / 15 = 32)
    [2, "cup", "tbsp", 32],
    // 3 tbsp -> tsp (3 * 15 / 5 = 9)
    [3, "tbsp", "tsp", 9],
    // 1 kg -> oz (1000 / 28.3495 = 35.274)
    [1, "kg", "oz", 35.274],
    // 5 floz -> mL (5 * 29.57 = 147.85)
    [5, "floz", "mL", 147.85],
  ];

  it.each(explicitHandComputedCases)(
    "%s %s -> %s ~= %s",
    (quantity, fromUnit, toUnit, expected) => {
      const canonical = toCanonical(quantity, fromUnit).quantityCanonical;
      const converted = canonical / UNITS[toUnit].toCanonicalFactor;
      expectWithinRelativeTolerance(converted, expected, FR10_TOLERANCE);
    },
  );

  // Exhaustive pairwise sweep: for every class, every ordered pair of units
  // in that class round-trips through canonical within 1%.
  const unitsByClass: Record<UnitClass, string[]> = {
    MASS: [],
    VOLUME: [],
    COUNT: [],
  };
  for (const [unit, def] of Object.entries(EXPECTED_UNITS)) {
    unitsByClass[def.class].push(unit);
  }

  for (const [unitClass, units] of Object.entries(unitsByClass) as Array<
    [UnitClass, string[]]
  >) {
    describe(`class ${unitClass}`, () => {
      for (const unitA of units) {
        for (const unitB of units) {
          it(`3 ${unitA} converted to ${unitB} and back to canonical matches the original canonical quantity within 1%`, () => {
            const originalCanonical = toCanonical(3, unitA).quantityCanonical;
            const displayInUnitB = originalCanonical / UNITS[unitB].toCanonicalFactor;
            const roundTrippedCanonical = toCanonical(
              displayInUnitB,
              unitB,
            ).quantityCanonical;
            expectWithinRelativeTolerance(
              roundTrippedCanonical,
              originalCanonical,
              FR10_TOLERANCE,
            );
          });
        }
      }
    });
  }
});

describe("domain/units — resolveQuantityForComparison() (AC4-AC6, FR-11, FR-12)", () => {
  it("same class (MASS/MASS): returns the canonical quantity unchanged", () => {
    expect(resolveQuantityForComparison(100, "MASS", "MASS", null)).toBe(100);
  });

  it("same class (VOLUME/VOLUME): returns the canonical quantity unchanged, even with density set", () => {
    expect(resolveQuantityForComparison(250, "VOLUME", "VOLUME", 0.53)).toBe(
      250,
    );
  });

  it("same class (COUNT/COUNT): returns the canonical quantity unchanged", () => {
    expect(resolveQuantityForComparison(4, "COUNT", "COUNT", null)).toBe(4);
  });

  it("MASS -> VOLUME with density: converts g to mL (mL = g / density) within 5% (FR-12)", () => {
    // 127.2 g of flour at density 0.53 g/mL should compare as ~240 mL.
    const result = resolveQuantityForComparison(127.2, "MASS", "VOLUME", 0.53);
    expect(result).not.toBe("UNRESOLVED");
    expectWithinRelativeTolerance(result as number, 240, FR12_TOLERANCE);
  });

  it("VOLUME -> MASS with density: converts mL to g (g = mL * density) within 5% (FR-12)", () => {
    // 240 mL of flour at density 0.53 g/mL should compare as ~127.2 g.
    const result = resolveQuantityForComparison(240, "VOLUME", "MASS", 0.53);
    expect(result).not.toBe("UNRESOLVED");
    expectWithinRelativeTolerance(result as number, 127.2, FR12_TOLERANCE);
  });

  it("VOLUME -> MASS with a different density (milk, 1.03 g/mL) within 5%", () => {
    const result = resolveQuantityForComparison(500, "VOLUME", "MASS", 1.03);
    expect(result).not.toBe("UNRESOLVED");
    expectWithinRelativeTolerance(result as number, 515, FR12_TOLERANCE);
  });

  it("MASS <-> VOLUME with NO density: returns the 'UNRESOLVED' sentinel, never a number (FR-11)", () => {
    expect(resolveQuantityForComparison(100, "MASS", "VOLUME", null)).toBe(
      "UNRESOLVED",
    );
    expect(resolveQuantityForComparison(100, "VOLUME", "MASS", null)).toBe(
      "UNRESOLVED",
    );
  });

  it("COUNT vs MASS returns 'UNRESOLVED' even when density is set (FR-11 — COUNT never converts cross-class)", () => {
    expect(resolveQuantityForComparison(3, "COUNT", "MASS", 0.53)).toBe(
      "UNRESOLVED",
    );
    expect(resolveQuantityForComparison(100, "MASS", "COUNT", 0.53)).toBe(
      "UNRESOLVED",
    );
  });

  it("COUNT vs VOLUME returns 'UNRESOLVED' even when density is set (FR-11 — COUNT never converts cross-class)", () => {
    expect(resolveQuantityForComparison(3, "COUNT", "VOLUME", 0.53)).toBe(
      "UNRESOLVED",
    );
    expect(resolveQuantityForComparison(240, "VOLUME", "COUNT", 0.53)).toBe(
      "UNRESOLVED",
    );
  });

  it("never returns 0 or NaN for an unresolved comparison — always the literal sentinel 'UNRESOLVED'", () => {
    const unresolvedCases = [
      resolveQuantityForComparison(100, "MASS", "VOLUME", null),
      resolveQuantityForComparison(3, "COUNT", "MASS", 0.53),
      resolveQuantityForComparison(3, "COUNT", "VOLUME", null),
    ];
    for (const value of unresolvedCases) {
      expect(value).not.toBe(0);
      expect(Number.isNaN(value as number)).toBe(false);
      expect(value).toBe("UNRESOLVED");
    }
  });

  it("does not throw for the unresolved case (FR-11 dev note: never throw, never NaN)", () => {
    expect(() =>
      resolveQuantityForComparison(100, "MASS", "VOLUME", null),
    ).not.toThrow();
  });
});

describe("domain/units, domain/types — framework-free boundary (AC7)", () => {
  const forbiddenImportPatterns = [
    /from\s+["']next(\/|["'])/,
    /from\s+["']react(\/|["'])/,
    /from\s+["']drizzle-orm/,
    /from\s+["']better-sqlite3/,
  ];

  it.each(["domain/units.ts", "domain/types.ts"])(
    "%s imports nothing from Next.js, React, Drizzle, or better-sqlite3",
    (relativePath) => {
      const absolutePath = fileURLToPath(
        new URL(`../../../${relativePath}`, import.meta.url),
      );
      const source = readFileSync(absolutePath, "utf-8");
      for (const pattern of forbiddenImportPatterns) {
        expect(
          pattern.test(source),
          `${relativePath} should not match forbidden import pattern ${pattern}`,
        ).toBe(false);
      }
    },
  );
});
