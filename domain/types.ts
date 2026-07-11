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
