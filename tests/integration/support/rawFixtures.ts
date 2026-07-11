import type Database from "better-sqlite3";

/**
 * S-202 repository-test fixture builders: insert rows directly via raw SQL
 * (bypassing the repository layer under test, per the same pattern
 * `tests/integration/constraints.test.ts` uses for S-201) so repository
 * tests can set up referencing data (recipes/lines/pantry rows) without
 * depending on sibling repositories that are equally under test.
 */

export interface RawIngredientOverrides {
  seedKey?: string | null;
  name?: string;
  unitClass?: "MASS" | "VOLUME" | "COUNT";
  densityGPerMl?: number | null;
  caloriesPerRef?: number;
  proteinPerRef?: number;
  carbsPerRef?: number;
  fatPerRef?: number;
  fiberPerRef?: number | null;
  sugarPerRef?: number | null;
  sodiumMgPerRef?: number | null;
  source?: "SEEDED" | "CUSTOM";
  overridden?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const FIXED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

export function insertRawIngredient(sqlite: Database.Database, overrides: RawIngredientOverrides = {}): number {
  const stmt = sqlite.prepare(`
    INSERT INTO ingredient
      (seedKey, name, unitClass, densityGPerMl, caloriesPerRef, proteinPerRef, carbsPerRef, fatPerRef,
       fiberPerRef, sugarPerRef, sodiumMgPerRef, source, overridden, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    overrides.seedKey ?? null,
    overrides.name ?? "Test Ingredient",
    overrides.unitClass ?? "MASS",
    overrides.densityGPerMl ?? null,
    overrides.caloriesPerRef ?? 40,
    overrides.proteinPerRef ?? 1.1,
    overrides.carbsPerRef ?? 9.3,
    overrides.fatPerRef ?? 0.1,
    overrides.fiberPerRef ?? null,
    overrides.sugarPerRef ?? null,
    overrides.sodiumMgPerRef ?? null,
    overrides.source ?? "CUSTOM",
    overrides.overridden ? 1 : 0,
    overrides.createdAt ?? FIXED_TIMESTAMP,
    overrides.updatedAt ?? FIXED_TIMESTAMP,
  );
  return Number(info.lastInsertRowid);
}

export interface RawRecipeOverrides {
  name?: string;
  servings?: number;
  instructions?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function insertRawRecipe(sqlite: Database.Database, overrides: RawRecipeOverrides = {}): number {
  const stmt = sqlite.prepare(`
    INSERT INTO recipe (name, servings, instructions, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    overrides.name ?? "Test Recipe",
    overrides.servings ?? 4,
    overrides.instructions ?? "",
    overrides.createdAt ?? FIXED_TIMESTAMP,
    overrides.updatedAt ?? FIXED_TIMESTAMP,
  );
  return Number(info.lastInsertRowid);
}

export interface RawRecipeLineOverrides {
  quantityCanonical?: number;
  entryUnitClass?: "MASS" | "VOLUME" | "COUNT";
  displayQuantity?: number;
  displayUnit?: string;
}

export function insertRawRecipeLine(
  sqlite: Database.Database,
  recipeId: number,
  ingredientId: number,
  overrides: RawRecipeLineOverrides = {},
): number {
  const stmt = sqlite.prepare(`
    INSERT INTO recipe_line (recipeId, ingredientId, quantityCanonical, entryUnitClass, displayQuantity, displayUnit)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    recipeId,
    ingredientId,
    overrides.quantityCanonical ?? 50,
    overrides.entryUnitClass ?? "MASS",
    overrides.displayQuantity ?? 50,
    overrides.displayUnit ?? "g",
  );
  return Number(info.lastInsertRowid);
}

export interface RawPantryItemOverrides {
  quantityCanonical?: number;
  entryUnitClass?: "MASS" | "VOLUME" | "COUNT";
  displayQuantity?: number;
  displayUnit?: string;
  updatedAt?: string;
}

export function insertRawPantryItem(
  sqlite: Database.Database,
  ingredientId: number,
  overrides: RawPantryItemOverrides = {},
): number {
  const stmt = sqlite.prepare(`
    INSERT INTO pantry_item (ingredientId, quantityCanonical, entryUnitClass, displayQuantity, displayUnit, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    ingredientId,
    overrides.quantityCanonical ?? 100,
    overrides.entryUnitClass ?? "MASS",
    overrides.displayQuantity ?? 100,
    overrides.displayUnit ?? "g",
    overrides.updatedAt ?? FIXED_TIMESTAMP,
  );
  return Number(info.lastInsertRowid);
}

export function countRows(sqlite: Database.Database, table: string): number {
  return (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}
