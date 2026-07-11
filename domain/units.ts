/**
 * Unit conversion (architecture.md §4/§5): UNITS, toCanonical(),
 * resolveQuantityForComparison(). Pure, framework-free — no imports
 * from next/*, react, drizzle-orm, or better-sqlite3 (ESLint-enforced,
 * see eslint.config.mjs).
 *
 * Traces to FR-9, FR-10, FR-11, FR-12 / NFR-7 and
 * docs/stories/S-102-domain-units.md.
 */

import type { UnitClass } from "./types";

export type { UnitClass } from "./types";

/**
 * Fixed unit table (architecture.md §4). Not a database table — a
 * versioned code constant. `toCanonicalFactor` is the multiplier that
 * converts a display quantity in this unit to the class's canonical
 * unit (g for MASS, mL for VOLUME, each for COUNT).
 */
export const UNITS: Record<string, { class: UnitClass; toCanonicalFactor: number }> = {
  g: { class: "MASS", toCanonicalFactor: 1 },
  kg: { class: "MASS", toCanonicalFactor: 1000 },
  oz: { class: "MASS", toCanonicalFactor: 28.3495 },
  lb: { class: "MASS", toCanonicalFactor: 453.592 },
  mL: { class: "VOLUME", toCanonicalFactor: 1 },
  L: { class: "VOLUME", toCanonicalFactor: 1000 },
  tsp: { class: "VOLUME", toCanonicalFactor: 5 },
  tbsp: { class: "VOLUME", toCanonicalFactor: 15 },
  cup: { class: "VOLUME", toCanonicalFactor: 240 },
  floz: { class: "VOLUME", toCanonicalFactor: 29.57 },
  each: { class: "COUNT", toCanonicalFactor: 1 },
};

/**
 * Converts a display quantity/unit into the class's canonical unit.
 * Pure — does not mutate inputs, full precision (no rounding). Throws
 * if `displayUnit` is not a key of `UNITS` (FR-9: never silently guess).
 */
export function toCanonical(
  displayQuantity: number,
  displayUnit: string,
): { quantityCanonical: number; entryUnitClass: UnitClass } {
  const unit = UNITS[displayUnit];
  if (!unit) {
    throw new Error(`Unknown unit: "${displayUnit}"`);
  }
  return {
    quantityCanonical: displayQuantity * unit.toCanonicalFactor,
    entryUnitClass: unit.class,
  };
}

/**
 * Resolves a canonical quantity in `entryClass` for comparison against
 * `targetClass`, per architecture.md §4's "Canonical-unit & density
 * strategy". Used identically by nutrition computation (S-103) and
 * matching (S-104). Never throws, never returns 0 or NaN for an
 * unresolved comparison — the literal sentinel `'UNRESOLVED'` instead.
 */
export function resolveQuantityForComparison(
  entryQtyCanonical: number,
  entryClass: UnitClass,
  targetClass: UnitClass,
  densityGPerMl: number | null,
): number | "UNRESOLVED" {
  if (entryClass === targetClass) {
    return entryQtyCanonical;
  }

  if (densityGPerMl !== null) {
    if (entryClass === "MASS" && targetClass === "VOLUME") {
      // g -> mL: mL = g / density
      return entryQtyCanonical / densityGPerMl;
    }
    if (entryClass === "VOLUME" && targetClass === "MASS") {
      // mL -> g: g = mL * density
      return entryQtyCanonical * densityGPerMl;
    }
  }

  return "UNRESOLVED";
}
