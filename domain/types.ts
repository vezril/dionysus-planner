/**
 * Domain shapes (architecture.md §4/§5).
 *
 * This module is PURE and framework-free: no drizzle-orm, no
 * better-sqlite3, no next/*, no react imports here (ESLint-enforced,
 * see eslint.config.mjs). Real fields are added story-by-story
 * (S-201 DB schema, S-3xx domain logic) — this is a placeholder
 * shape only, to unblock the directory skeleton and toolchain (S-101).
 */

export type UnitClass = "MASS" | "VOLUME" | "COUNT";

/**
 * Reference quantity per unit class, in that class's canonical unit
 * (g for MASS, mL for VOLUME, each for COUNT). Ingredient macro fields
 * are expressed "per reference quantity" — this named constant removes
 * an entire class of "which basis is this row in" bugs (architecture.md
 * §4). Consumed by S-103 nutrition computation.
 */
export const REFERENCE_QUANTITY_BY_CLASS: Record<UnitClass, number> = {
  MASS: 100,
  VOLUME: 100,
  COUNT: 1,
};

export type IngredientSource = "SEEDED" | "CUSTOM";

/**
 * Placeholder domain type — filled in fully by S-201 (DB schema) and
 * the domain logic stories. Not yet used by any real code path.
 */
export interface Ingredient {
  id: number;
  name: string;
  unitClass: UnitClass;
  source: IngredientSource;
}
