import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/data/migrate";
import {
  createMigratedMemoryDb,
  foreignKeys,
  requireColumn,
  tableColumns,
  tableNames,
  uniqueColumnSets,
} from "./support/migratedDb";

/**
 * S-201 AC1 + AC6 groundwork: applying `runMigrations(db)` from
 * `data/migrate.ts` against a fresh `:memory:` database must create all
 * five domain tables with the exact fields/constraints specified in
 * architecture.md §4. Assertions go through raw SQL introspection
 * (sqlite_master / PRAGMA) so they pin the SCHEMA, not Drizzle's runtime
 * behavior — the implementer is free to model schema.ts however they like
 * as long as the resulting SQLite schema matches.
 *
 * Table/column names are taken verbatim from the story (AC1: "ingredient,
 * pantry_item, recipe, recipe_line, recipe_tag") and architecture.md §4's
 * field tables (camelCase field names, e.g. `ingredientId`, `seedKey`,
 * `caloriesPerRef`).
 */
describe("data/migrate.ts runMigrations — schema shape", () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = createMigratedMemoryDb();
  });

  it("creates all five domain tables", () => {
    const names = tableNames(sqlite);
    expect(names).toEqual(
      expect.arrayContaining(["ingredient", "pantry_item", "recipe", "recipe_line", "recipe_tag"]),
    );
  });

  it("re-applying runMigrations on the same connection is a no-op (idempotent via the migrator journal)", () => {
    // Second application must not throw and must not change the set of
    // applied migrations or tables.
    expect(() => runMigrations(sqlite)).not.toThrow();

    const journalCount = (
      sqlite.prepare(`SELECT COUNT(*) AS n FROM __drizzle_migrations`).get() as { n: number }
    ).n;
    expect(journalCount).toBeGreaterThan(0);

    // Running it a third time still doesn't grow the journal.
    runMigrations(sqlite);
    const journalCountAfter = (
      sqlite.prepare(`SELECT COUNT(*) AS n FROM __drizzle_migrations`).get() as { n: number }
    ).n;
    expect(journalCountAfter).toBe(journalCount);

    expect(tableNames(sqlite)).toEqual(
      expect.arrayContaining(["ingredient", "pantry_item", "recipe", "recipe_line", "recipe_tag"]),
    );
  });

  describe("ingredient table", () => {
    it("has the required columns with correct nullability", () => {
      const cols = tableColumns(sqlite, "ingredient");

      expect(requireColumn(cols, "id").pk).toBeGreaterThan(0);

      expect(requireColumn(cols, "seedKey").notnull).toBe(0);
      expect(requireColumn(cols, "name").notnull).toBe(1);
      expect(requireColumn(cols, "unitClass").notnull).toBe(1);
      expect(requireColumn(cols, "densityGPerMl").notnull).toBe(0);

      expect(requireColumn(cols, "caloriesPerRef").notnull).toBe(1);
      expect(requireColumn(cols, "proteinPerRef").notnull).toBe(1);
      expect(requireColumn(cols, "carbsPerRef").notnull).toBe(1);
      expect(requireColumn(cols, "fatPerRef").notnull).toBe(1);

      expect(requireColumn(cols, "fiberPerRef").notnull).toBe(0);
      expect(requireColumn(cols, "sugarPerRef").notnull).toBe(0);
      expect(requireColumn(cols, "sodiumMgPerRef").notnull).toBe(0);

      expect(requireColumn(cols, "source").notnull).toBe(1);
      expect(requireColumn(cols, "overridden").notnull).toBe(1);
      expect(requireColumn(cols, "createdAt").notnull).toBe(1);
      expect(requireColumn(cols, "updatedAt").notnull).toBe(1);
    });

    it("has a unique constraint on seedKey (FR-28 idempotency key)", () => {
      expect(uniqueColumnSets(sqlite, "ingredient")).toContainEqual(["seedKey"]);
    });
  });

  describe("pantry_item table", () => {
    it("has the required columns with correct nullability", () => {
      const cols = tableColumns(sqlite, "pantry_item");

      expect(requireColumn(cols, "id").pk).toBeGreaterThan(0);
      expect(requireColumn(cols, "ingredientId").notnull).toBe(1);
      expect(requireColumn(cols, "quantityCanonical").notnull).toBe(1);
      expect(requireColumn(cols, "entryUnitClass").notnull).toBe(1);
      expect(requireColumn(cols, "displayQuantity").notnull).toBe(1);
      expect(requireColumn(cols, "displayUnit").notnull).toBe(1);
      expect(requireColumn(cols, "updatedAt").notnull).toBe(1);
    });

    it("has a unique constraint on ingredientId — the DB-level backstop for FR-6", () => {
      expect(uniqueColumnSets(sqlite, "pantry_item")).toContainEqual(["ingredientId"]);
    });

    it("has an ON DELETE RESTRICT foreign key to ingredient", () => {
      const fks = foreignKeys(sqlite, "pantry_item");
      const fk = fks.find((f) => f.from === "ingredientId");
      expect(fk, "expected an FK from pantry_item.ingredientId").toBeDefined();
      expect(fk!.table).toBe("ingredient");
      expect(fk!.on_delete).toBe("RESTRICT");
    });
  });

  describe("recipe table", () => {
    it("has the required columns, all NOT NULL", () => {
      const cols = tableColumns(sqlite, "recipe");

      expect(requireColumn(cols, "id").pk).toBeGreaterThan(0);
      expect(requireColumn(cols, "name").notnull).toBe(1);
      expect(requireColumn(cols, "servings").notnull).toBe(1);
      // instructions is NOT NULL but MAY be an empty string (architecture §4 / A-2).
      expect(requireColumn(cols, "instructions").notnull).toBe(1);
      expect(requireColumn(cols, "createdAt").notnull).toBe(1);
      expect(requireColumn(cols, "updatedAt").notnull).toBe(1);
    });

    it("declares a CHECK constraint referencing servings (FR-13 DB backstop)", () => {
      const row = sqlite
        .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'recipe'`)
        .get() as { sql: string };
      expect(row.sql).toMatch(/CHECK/i);
      expect(row.sql).toMatch(/servings/i);
    });
  });

  describe("recipe_line table", () => {
    it("has the required columns with correct nullability", () => {
      const cols = tableColumns(sqlite, "recipe_line");

      expect(requireColumn(cols, "id").pk).toBeGreaterThan(0);
      expect(requireColumn(cols, "recipeId").notnull).toBe(1);
      expect(requireColumn(cols, "ingredientId").notnull).toBe(1);
      expect(requireColumn(cols, "quantityCanonical").notnull).toBe(1);
      expect(requireColumn(cols, "entryUnitClass").notnull).toBe(1);
      expect(requireColumn(cols, "displayQuantity").notnull).toBe(1);
      expect(requireColumn(cols, "displayUnit").notnull).toBe(1);
    });

    it("cascades on recipeId and restricts on ingredientId (FR-15 / FR-4 backstop)", () => {
      const fks = foreignKeys(sqlite, "recipe_line");

      const recipeFk = fks.find((f) => f.from === "recipeId");
      expect(recipeFk, "expected an FK from recipe_line.recipeId").toBeDefined();
      expect(recipeFk!.table).toBe("recipe");
      expect(recipeFk!.on_delete).toBe("CASCADE");

      const ingredientFk = fks.find((f) => f.from === "ingredientId");
      expect(ingredientFk, "expected an FK from recipe_line.ingredientId").toBeDefined();
      expect(ingredientFk!.table).toBe("ingredient");
      expect(ingredientFk!.on_delete).toBe("RESTRICT");
    });
  });

  describe("recipe_tag table", () => {
    it("has a composite primary key over (recipeId, tag)", () => {
      const cols = tableColumns(sqlite, "recipe_tag");
      const recipeIdCol = requireColumn(cols, "recipeId");
      const tagCol = requireColumn(cols, "tag");
      expect(recipeIdCol.pk).toBeGreaterThan(0);
      expect(tagCol.pk).toBeGreaterThan(0);
    });

    it("cascades when the parent recipe is deleted", () => {
      const fks = foreignKeys(sqlite, "recipe_tag");
      const fk = fks.find((f) => f.from === "recipeId");
      expect(fk, "expected an FK from recipe_tag.recipeId").toBeDefined();
      expect(fk!.table).toBe("recipe");
      expect(fk!.on_delete).toBe("CASCADE");
    });
  });
});
