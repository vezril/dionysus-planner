/**
 * Unit conversion (architecture.md §4/§5): UNIT_DEFINITIONS, toCanonical(),
 * resolveQuantityForComparison(). Placeholder only — real implementation
 * lands with the FR-10/11/12 domain stories. Pure, framework-free.
 */

import type { UnitClass } from "./types";

/**
 * Placeholder pure export so the toolchain (S-101) has something real
 * to unit-test. Not the final API — later stories replace this with
 * the full UNIT_DEFINITIONS table described in architecture.md §4.
 */
export const PLACEHOLDER_UNIT_CLASSES: readonly UnitClass[] = [
  "MASS",
  "VOLUME",
  "COUNT",
];

export function isKnownUnitClass(value: string): value is UnitClass {
  return (PLACEHOLDER_UNIT_CLASSES as readonly string[]).includes(value);
}
