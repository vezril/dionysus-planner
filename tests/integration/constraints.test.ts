import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createMigratedMemoryDb } from "./support/migratedDb";

/**
 * S-201 AC3/AC4/AC5 — DB-level constraint behavior, exercised through raw
 * SQL against a migrated `:memory:` connection with `PRAGMA foreign_keys =
 * ON` (mirrors data/db.ts's connection setup). These tests insert/delete
 * directly at the DB level (bypassing any future repository/app logic —
 * repositories land in S-202) to prove the constraints themselves are the
 * backstop, per FR-4/FR-6/FR-13/FR-15.
 */
describe("S-201 constraint suite", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = createMigratedMemoryDb();
  });

  function insertIngredient(overrides: Partial<{ seedKey: string | null; name: string }> = {}): number {
    const stmt = sqlite.prepare(`
      INSERT INTO ingredient
        (seedKey, name, unitClass, densityGPerMl, caloriesPerRef, proteinPerRef, carbsPerRef, fatPerRef,
         fiberPerRef, sugarPerRef, sodiumMgPerRef, source, overridden, createdAt, updatedAt)
      VALUES (?, ?, 'MASS', NULL, 40, 1.1, 9.3, 0.1, 1.7, 4.2, 4, 'CUSTOM', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `);
    const info = stmt.run(overrides.seedKey ?? null, overrides.name ?? "Test Onion");
    return Number(info.lastInsertRowid);
  }

  function insertRecipe(servings = 4): number {
    const stmt = sqlite.prepare(`
      INSERT INTO recipe (name, servings, instructions, createdAt, updatedAt)
      VALUES (?, ?, '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `);
    const info = stmt.run("Test Recipe", servings);
    return Number(info.lastInsertRowid);
  }

  function insertPantryItem(ingredientId: number): number {
    const stmt = sqlite.prepare(`
      INSERT INTO pantry_item (ingredientId, quantityCanonical, entryUnitClass, displayQuantity, displayUnit, updatedAt)
      VALUES (?, 100, 'MASS', 100, 'g', '2026-01-01T00:00:00.000Z')
    `);
    const info = stmt.run(ingredientId);
    return Number(info.lastInsertRowid);
  }

  function insertRecipeLine(recipeId: number, ingredientId: number): number {
    const stmt = sqlite.prepare(`
      INSERT INTO recipe_line (recipeId, ingredientId, quantityCanonical, entryUnitClass, displayQuantity, displayUnit)
      VALUES (?, ?, 50, 'MASS', 50, 'g')
    `);
    const info = stmt.run(recipeId, ingredientId);
    return Number(info.lastInsertRowid);
  }

  it("rejects a second pantry_item for the same ingredientId (FR-6 unique invariant)", () => {
    const ingredientId = insertIngredient();
    insertPantryItem(ingredientId);

    expect(() => insertPantryItem(ingredientId)).toThrowError(/UNIQUE constraint failed/i);
  });

  it("rejects deleting an ingredient referenced by a pantry_item (ON DELETE RESTRICT)", () => {
    const ingredientId = insertIngredient();
    insertPantryItem(ingredientId);

    expect(() => sqlite.prepare(`DELETE FROM ingredient WHERE id = ?`).run(ingredientId)).toThrowError(
      /FOREIGN KEY constraint failed/i,
    );
  });

  it("rejects deleting an ingredient referenced by a recipe_line (ON DELETE RESTRICT)", () => {
    const ingredientId = insertIngredient();
    const recipeId = insertRecipe();
    insertRecipeLine(recipeId, ingredientId);

    expect(() => sqlite.prepare(`DELETE FROM ingredient WHERE id = ?`).run(ingredientId)).toThrowError(
      /FOREIGN KEY constraint failed/i,
    );
  });

  it("cascades recipe_line deletion when the parent recipe is deleted, leaving ingredient and pantry_item untouched (FR-15)", () => {
    const ingredientId = insertIngredient();
    const recipeId = insertRecipe();
    insertRecipeLine(recipeId, ingredientId);
    insertPantryItem(ingredientId);

    expect(() => sqlite.prepare(`DELETE FROM recipe WHERE id = ?`).run(recipeId)).not.toThrow();

    const remainingLines = (
      sqlite.prepare(`SELECT COUNT(*) AS n FROM recipe_line WHERE recipeId = ?`).get(recipeId) as { n: number }
    ).n;
    expect(remainingLines).toBe(0);

    const ingredientStillExists = (
      sqlite.prepare(`SELECT COUNT(*) AS n FROM ingredient WHERE id = ?`).get(ingredientId) as { n: number }
    ).n;
    expect(ingredientStillExists).toBe(1);

    const pantryStillExists = (
      sqlite.prepare(`SELECT COUNT(*) AS n FROM pantry_item WHERE ingredientId = ?`).get(ingredientId) as {
        n: number;
      }
    ).n;
    expect(pantryStillExists).toBe(1);
  });

  it("rejects a recipe insert with servings = 0 (FR-13 CHECK constraint)", () => {
    expect(() => insertRecipe(0)).toThrowError(/CHECK constraint failed/i);
  });

  it("rejects a duplicate (recipeId, tag) pair on recipe_tag (composite PK)", () => {
    const recipeId = insertRecipe();
    sqlite.prepare(`INSERT INTO recipe_tag (recipeId, tag) VALUES (?, ?)`).run(recipeId, "quick");

    expect(() =>
      sqlite.prepare(`INSERT INTO recipe_tag (recipeId, tag) VALUES (?, ?)`).run(recipeId, "quick"),
    ).toThrowError(/UNIQUE constraint failed|PRIMARY KEY/i);
  });
});
