import { beforeEach, describe, expect, it } from "vitest";
 
// is currently a placeholder (`export {}`, S-101 scaffold); this suite is
// intentionally RED until the S-202 implementer builds the named exports
// below. Do not "fix" this suite by loosening assertions — implement the
// module to this contract instead.
import * as ingredientRepo from "@/data/repositories/ingredientRepo";
import { createMigratedDrizzleDb, type MigratedDrizzleDb } from "../support/migratedDb";
import {
  insertRawIngredient,
  insertRawPantryItem,
  insertRawRecipe,
  insertRawRecipeLine,
} from "../support/rawFixtures";

/**
 * S-202: ingredientRepo (data <-> domain mapping).
 *
 * Traces to docs/stories/S-202-repositories.md AC-5, AC-6, and the
 * ingredientRepo task list (create/update/getById/listAll/searchByName/
 * getReferencesTo/delete). Covers FR-5 (search query), FR-24 (ID-/
 * substring-only lookups, never fuzzy), FR-4 (friendly delete-blocking
 * data via getReferencesTo).
 *
 * `data/repositories/ingredientRepo.ts` is currently `export {}` — every
 * test below is intentionally RED (TypeError: ingredientRepo.create is not
 * a function, or similar) until the implementer builds the module.
 *
 * ============================ PINNED API SHAPE ============================
 * (this is the demanded contract — the implementer builds to this, not the
 * other way around; if a name/shape here is wrong per the story/
 * architecture, that's a hand-back conversation, not a silent test edit)
 *
 * interface IngredientRecord {
 *   id: number;
 *   seedKey: string | null;
 *   name: string;
 *   unitClass: "MASS" | "VOLUME" | "COUNT";
 *   densityGPerMl: number | null;
 *   caloriesPerRef: number;
 *   proteinPerRef: number;
 *   carbsPerRef: number;
 *   fatPerRef: number;
 *   fiberPerRef: number | null;
 *   sugarPerRef: number | null;
 *   sodiumMgPerRef: number | null;
 *   source: "SEEDED" | "CUSTOM";
 *   overridden: boolean;
 *   createdAt: string;
 *   updatedAt: string;
 * }
 *
 * ingredientRepo.create(db, input: Omit<IngredientRecord, "id"|"createdAt"|"updatedAt"|"overridden"> & { overridden?: boolean }): IngredientRecord
 *   - stamps id/createdAt/updatedAt; overridden defaults false.
 * ingredientRepo.getById(db, id: number): IngredientRecord | null
 * ingredientRepo.listAll(db): IngredientRecord[]
 * ingredientRepo.searchByName(db, query: string): IngredientRecord[]
 *   - case-insensitive SUBSTRING match only (FR-24: never fuzzy).
 * ingredientRepo.update(db, id: number, patch: Partial<Pick<IngredientRecord,
 *   "name"|"densityGPerMl"|"caloriesPerRef"|"proteinPerRef"|"carbsPerRef"|
 *   "fatPerRef"|"fiberPerRef"|"sugarPerRef"|"sodiumMgPerRef"|"overridden">>): IngredientRecord
 * ingredientRepo.getReferencesTo(db, id: number): {
 *   recipes: Array<{ id: number; name: string }>;
 *   inPantry: boolean;
 * }
 * ingredientRepo.remove(db, id: number): void
 *   (named `remove`, not `delete` — `delete` is a reserved word and cannot
 *   be a function declaration's name; use whatever name the implementer's
 *   docstring documents if this needs to change, but keep it a plain named
 *   export usable as `ingredientRepo.remove(...)` via namespace import.)
 * ===========================================================================
 */
describe("data/repositories/ingredientRepo", () => {
  let db: MigratedDrizzleDb;

  beforeEach(() => {
    ({ db } = createMigratedDrizzleDb());
  });

  const CUSTOM_INGREDIENT_INPUT = {
    seedKey: null,
    name: "Yellow Onion",
    unitClass: "MASS" as const,
    densityGPerMl: null,
    caloriesPerRef: 40,
    proteinPerRef: 1.1,
    carbsPerRef: 9.3,
    fatPerRef: 0.1,
    fiberPerRef: 1.7,
    sugarPerRef: 4.2,
    sodiumMgPerRef: 4,
    source: "CUSTOM" as const,
  };

  describe("create() + getById() round-trip", () => {
    it("creates a custom ingredient and reads it back with a matching domain shape", async () => {
      const created = await ingredientRepo.create(db, CUSTOM_INGREDIENT_INPUT);

      expect(created.id).toEqual(expect.any(Number));
      expect(created.source).toBe("CUSTOM");
      expect(created.overridden).toBe(false);
      expect(typeof created.createdAt).toBe("string");
      expect(typeof created.updatedAt).toBe("string");

      const found = await ingredientRepo.getById(db, created.id);
      expect(found).toEqual(created);
    });

    it("returns exactly the documented field set — no Drizzle row metadata leaking through", async () => {
      const created = await ingredientRepo.create(db, CUSTOM_INGREDIENT_INPUT);

      expect(Object.keys(created).sort()).toEqual(
        [
          "id",
          "seedKey",
          "name",
          "unitClass",
          "densityGPerMl",
          "caloriesPerRef",
          "proteinPerRef",
          "carbsPerRef",
          "fatPerRef",
          "fiberPerRef",
          "sugarPerRef",
          "sodiumMgPerRef",
          "source",
          "overridden",
          "createdAt",
          "updatedAt",
        ].sort(),
      );
      // overridden must be a real boolean, not SQLite's 0/1 integer.
      expect(typeof created.overridden).toBe("boolean");
    });

    it("returns null for a nonexistent id (never throws for a plain miss)", async () => {
      expect(await ingredientRepo.getById(db, 999_999)).toBeNull();
    });
  });

  describe("listAll()", () => {
    it("returns every created ingredient", async () => {
      const a = await ingredientRepo.create(db, { ...CUSTOM_INGREDIENT_INPUT, name: "Yellow Onion" });
      const b = await ingredientRepo.create(db, { ...CUSTOM_INGREDIENT_INPUT, name: "Garlic" });

      const all = await ingredientRepo.listAll(db);
      expect(all.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
    });

    it("returns an empty array when the catalog is empty", async () => {
      expect(await ingredientRepo.listAll(db)).toEqual([]);
    });
  });

  describe("searchByName() — case-insensitive substring only (AC-5, FR-24)", () => {
    it("matches a case-insensitive substring of the name", async () => {
      const onion = await ingredientRepo.create(db, { ...CUSTOM_INGREDIENT_INPUT, name: "Yellow Onion" });
      const onionSoup = await ingredientRepo.create(db, { ...CUSTOM_INGREDIENT_INPUT, name: "Onion Soup Mix" });
      await ingredientRepo.create(db, { ...CUSTOM_INGREDIENT_INPUT, name: "Garlic" });

      const results = await ingredientRepo.searchByName(db, "onion");
      expect(results.map((i) => i.id).sort()).toEqual([onion.id, onionSoup.id].sort());
    });

    it("is case-insensitive regardless of query casing", async () => {
      const onion = await ingredientRepo.create(db, { ...CUSTOM_INGREDIENT_INPUT, name: "Yellow Onion" });

      const results = await ingredientRepo.searchByName(db, "OnIoN");
      expect(results.map((i) => i.id)).toContain(onion.id);
    });

    it("never fuzzy-matches — a substring with a missing letter matches nothing (FR-24)", async () => {
      await ingredientRepo.create(db, { ...CUSTOM_INGREDIENT_INPUT, name: "Yellow Onion" });

      const results = await ingredientRepo.searchByName(db, "onon");
      expect(results).toEqual([]);
    });

    it("returns an empty array when nothing matches", async () => {
      await ingredientRepo.create(db, { ...CUSTOM_INGREDIENT_INPUT, name: "Garlic" });
      expect(await ingredientRepo.searchByName(db, "zzz")).toEqual([]);
    });
  });

  describe("update()", () => {
    it("updates nutrition fields and the change is visible via getById", async () => {
      const created = await ingredientRepo.create(db, CUSTOM_INGREDIENT_INPUT);

      const updated = await ingredientRepo.update(db, created.id, {
        caloriesPerRef: 45,
        proteinPerRef: 1.3,
      });

      expect(updated.caloriesPerRef).toBe(45);
      expect(updated.proteinPerRef).toBe(1.3);
      // Untouched fields survive the partial update unchanged.
      expect(updated.name).toBe(created.name);

      const reread = await ingredientRepo.getById(db, created.id);
      expect(reread?.caloriesPerRef).toBe(45);
    });
  });

  describe("getReferencesTo() — FR-4 friendly delete-blocking data (AC-6)", () => {
    it("returns no references for an unreferenced ingredient", async () => {
      const created = await ingredientRepo.create(db, CUSTOM_INGREDIENT_INPUT);

      const refs = await ingredientRepo.getReferencesTo(db, created.id);
      expect(refs).toEqual({ recipes: [], inPantry: false });
    });

    it("lists the referencing recipe(s) by id and name when a recipe_line references the ingredient", async () => {
      const { db: rawDb, sqlite } = createMigratedDrizzleDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Rice" });
      const recipeId = insertRawRecipe(sqlite, { name: "Fried Rice" });
      insertRawRecipeLine(sqlite, recipeId, ingredientId);

      const refs = await ingredientRepo.getReferencesTo(rawDb, ingredientId);
      expect(refs.recipes).toEqual([{ id: recipeId, name: "Fried Rice" }]);
      expect(refs.inPantry).toBe(false);
    });

    it("reports pantry presence when the ingredient has a pantry_item row", async () => {
      const { db: rawDb, sqlite } = createMigratedDrizzleDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Flour" });
      insertRawPantryItem(sqlite, ingredientId);

      const refs = await ingredientRepo.getReferencesTo(rawDb, ingredientId);
      expect(refs.recipes).toEqual([]);
      expect(refs.inPantry).toBe(true);
    });

    it("reports both recipe references and pantry presence together", async () => {
      const { db: rawDb, sqlite } = createMigratedDrizzleDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Garlic" });
      const recipeId = insertRawRecipe(sqlite, { name: "Garlic Bread" });
      insertRawRecipeLine(sqlite, recipeId, ingredientId);
      insertRawPantryItem(sqlite, ingredientId);

      const refs = await ingredientRepo.getReferencesTo(rawDb, ingredientId);
      expect(refs.recipes).toEqual([{ id: recipeId, name: "Garlic Bread" }]);
      expect(refs.inPantry).toBe(true);
    });
  });

  describe("remove()", () => {
    it("deletes an unreferenced custom ingredient", async () => {
      const created = await ingredientRepo.create(db, CUSTOM_INGREDIENT_INPUT);

      await ingredientRepo.remove(db, created.id);

      expect(await ingredientRepo.getById(db, created.id)).toBeNull();
    });
  });
});
