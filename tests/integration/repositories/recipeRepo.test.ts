import { beforeEach, describe, expect, it } from "vitest";
 
// is currently a placeholder (`export {}`, S-101 scaffold); this suite is
// intentionally RED until the S-202 implementer builds the named exports
// below.
import * as recipeRepo from "@/data/repositories/recipeRepo";
import { createMigratedDrizzleDb, type MigratedDrizzleDb } from "../support/migratedDb";
import { countRows, insertRawIngredient } from "../support/rawFixtures";

/**
 * S-202: recipeRepo (data <-> domain mapping).
 *
 * Traces to docs/stories/S-202-repositories.md AC-2, AC-4, and the
 * recipeRepo task list (createWithLines transactional, getWithLinesAndIngredients
 * single-query join, getAllWithLines single-query join with the density
 * channel, updateWithLines atomic replace, delete). Covers Flow B (one
 * query -> computeRecipeNutrition) and Flow C/D (two-query pattern,
 * anti-N+1) per architecture.md §6.
 *
 * `data/repositories/recipeRepo.ts` is currently `export {}` — every test
 * below is intentionally RED until the implementer builds the module.
 *
 * ============================ PINNED API SHAPE ============================
 * interface RecipeLineInput {
 *   ingredientId: number;
 *   quantityCanonical: number;
 *   entryUnitClass: "MASS" | "VOLUME" | "COUNT";
 *   displayQuantity: number;
 *   displayUnit: string;
 * }
 * interface RecipeLineRecord extends RecipeLineInput {
 *   id: number;
 *   recipeId: number;
 * }
 * interface RecipeRecord {
 *   id: number;
 *   name: string;
 *   servings: number;
 *   instructions: string;
 *   createdAt: string;
 *   updatedAt: string;
 * }
 *
 * recipeRepo.createWithLines(db, input: { name, servings, instructions, lines: RecipeLineInput[] }):
 *   RecipeRecord & { lines: RecipeLineRecord[] }
 *   - transactional: recipe row + all line rows land together, or neither does.
 *
 * recipeRepo.getWithLinesAndIngredients(db, id: number):
 *   (RecipeRecord & { lines: Array<RecipeLineRecord & { ingredient: FullIngredientRecord }> }) | null
 *   - ONE SQL query (Flow B). Each line nests its FULL constituent
 *     ingredient (all nutrition fields) — this is what the Server Action
 *     folds into `ingredientsById` before calling
 *     `computeRecipeNutrition(recipe, ingredientsById)` (S-103).
 *
 * recipeRepo.getAllWithLines(db):
 *   Array<RecipeRecord & { lines: Array<RecipeLineRecord & { ingredient: { unitClass; densityGPerMl } }> }>
 *   - ONE SQL query, no per-recipe queries (AC-4, NFR-3). Each line nests
 *     ONLY `{ unitClass, densityGPerMl }` under `ingredient` — the density
 *     channel `domain/matching.ts` (S-104, already RED with this EXACT
 *     nested shape pinned in tests/unit/domain/matching.test.ts) and
 *     Flow C/D consume. Do not flatten these fields directly onto the
 *     line, and do not project the full ingredient here — matching.test.ts
 *     already pins `line.ingredient.unitClass` / `line.ingredient.densityGPerMl`.
 *
 * recipeRepo.updateWithLines(db, id: number, input: { name?, servings?, instructions?, lines: RecipeLineInput[] }):
 *   RecipeRecord & { lines: RecipeLineRecord[] }
 *   - replaces the entire line set atomically.
 *
 * recipeRepo.remove(db, id: number): void
 *   - cascades recipe_line rows; leaves ingredient/pantry_item untouched.
 * ===========================================================================
 */
describe("data/repositories/recipeRepo", () => {
  let db: MigratedDrizzleDb;
  let sqlite: ReturnType<typeof createMigratedDrizzleDb>["sqlite"];
  let chickenId: number;
  let riceId: number;

  beforeEach(() => {
    ({ db, sqlite } = createMigratedDrizzleDb());
    chickenId = insertRawIngredient(sqlite, {
      name: "Chicken Breast",
      unitClass: "MASS",
      caloriesPerRef: 165,
      proteinPerRef: 31,
      carbsPerRef: 0,
      fatPerRef: 3.6,
    });
    riceId = insertRawIngredient(sqlite, {
      name: "Rice",
      unitClass: "MASS",
      densityGPerMl: 0.85,
      caloriesPerRef: 130,
      proteinPerRef: 2.7,
      carbsPerRef: 28,
      fatPerRef: 0.3,
    });
  });

  const twoLineRecipeInput = () => ({
    name: "Chicken and Rice",
    servings: 4,
    instructions: "Cook it.",
    lines: [
      {
        ingredientId: chickenId,
        quantityCanonical: 400,
        entryUnitClass: "MASS" as const,
        displayQuantity: 400,
        displayUnit: "g",
      },
      {
        ingredientId: riceId,
        quantityCanonical: 300,
        entryUnitClass: "MASS" as const,
        displayQuantity: 300,
        displayUnit: "g",
      },
    ],
  });

  describe("createWithLines() — transactional recipe + lines (AC-2 groundwork)", () => {
    it("persists the recipe and every line together", async () => {
      const created = await recipeRepo.createWithLines(db, twoLineRecipeInput());

      expect(created.id).toEqual(expect.any(Number));
      expect(created.name).toBe("Chicken and Rice");
      expect(created.servings).toBe(4);
      expect(created.lines).toHaveLength(2);
      for (const line of created.lines) {
        expect(line.id).toEqual(expect.any(Number));
        expect(line.recipeId).toBe(created.id);
      }

      expect(countRows(sqlite, "recipe")).toBe(1);
      expect(countRows(sqlite, "recipe_line")).toBe(2);
    });

    it("stores displayQuantity/displayUnit verbatim alongside quantityCanonical (FR-9)", async () => {
      const created = await recipeRepo.createWithLines(db, twoLineRecipeInput());
      const chickenLine = created.lines.find((l) => l.ingredientId === chickenId)!;
      expect(chickenLine.quantityCanonical).toBe(400);
      expect(chickenLine.displayQuantity).toBe(400);
      expect(chickenLine.displayUnit).toBe("g");
    });

    it("rolls back the entire write when a line references a nonexistent ingredient — no orphan recipe row", async () => {
      const badInput = {
        name: "Broken Recipe",
        servings: 1,
        instructions: "",
        lines: [
          {
            ingredientId: 999_999,
            quantityCanonical: 10,
            entryUnitClass: "MASS" as const,
            displayQuantity: 10,
            displayUnit: "g",
          },
        ],
      };

      await expect((async () => recipeRepo.createWithLines(db, badInput))()).rejects.toThrow();

      expect(countRows(sqlite, "recipe")).toBe(0);
      expect(countRows(sqlite, "recipe_line")).toBe(0);
    });
  });

  describe("getWithLinesAndIngredients() — single-query join for Flow B nutrition", () => {
    it("returns the recipe, its lines, and each line's FULL constituent ingredient", async () => {
      const created = await recipeRepo.createWithLines(db, twoLineRecipeInput());

      const found = await recipeRepo.getWithLinesAndIngredients(db, created.id);

      expect(found).not.toBeNull();
      expect(found!.name).toBe("Chicken and Rice");
      expect(found!.servings).toBe(4);
      expect(found!.lines).toHaveLength(2);

      const chickenLine = found!.lines.find((l) => l.ingredientId === chickenId)!;
      expect(chickenLine.ingredient.id).toBe(chickenId);
      expect(chickenLine.ingredient.name).toBe("Chicken Breast");
      expect(chickenLine.ingredient.unitClass).toBe("MASS");
      expect(chickenLine.ingredient.caloriesPerRef).toBe(165);
      expect(chickenLine.ingredient.proteinPerRef).toBe(31);
      expect(chickenLine.ingredient.carbsPerRef).toBe(0);
      expect(chickenLine.ingredient.fatPerRef).toBe(3.6);

      const riceLine = found!.lines.find((l) => l.ingredientId === riceId)!;
      expect(riceLine.ingredient.densityGPerMl).toBe(0.85);
    });

    it("returns null for a nonexistent recipe id", async () => {
      expect(await recipeRepo.getWithLinesAndIngredients(db, 999_999)).toBeNull();
    });
  });

  describe("getAllWithLines() — single-query join, density channel projected onto each line (AC-4)", () => {
    it("returns all recipes with their lines in one call", async () => {
      const first = await recipeRepo.createWithLines(db, twoLineRecipeInput());
      const second = await recipeRepo.createWithLines(db, {
        name: "Rice Bowl",
        servings: 2,
        instructions: "",
        lines: [
          {
            ingredientId: riceId,
            quantityCanonical: 200,
            entryUnitClass: "MASS" as const,
            displayQuantity: 200,
            displayUnit: "g",
          },
        ],
      });

      const all = await recipeRepo.getAllWithLines(db);
      const byId = new Map(all.map((r) => [r.id, r]));

      expect(byId.get(first.id)?.lines).toHaveLength(2);
      expect(byId.get(second.id)?.lines).toHaveLength(1);
    });

    it("projects the ingredient's {unitClass, densityGPerMl} onto each line via a nested `ingredient` field — the density channel matching.ts consumes", async () => {
      const created = await recipeRepo.createWithLines(db, {
        name: "Rice Bowl",
        servings: 2,
        instructions: "",
        lines: [
          {
            // Rice is MASS-primary with densityGPerMl = 0.85; entered here
            // in VOLUME to exercise the density channel distinctly from the
            // line's own entryUnitClass.
            ingredientId: riceId,
            quantityCanonical: 240,
            entryUnitClass: "VOLUME" as const,
            displayQuantity: 1,
            displayUnit: "cup",
          },
        ],
      });

      const all = await recipeRepo.getAllWithLines(db);
      const found = all.find((r) => r.id === created.id)!;
      const line = found.lines[0];

      // The line's own entry fields are untouched by the join.
      expect(line.entryUnitClass).toBe("VOLUME");
      expect(line.quantityCanonical).toBe(240);

      // The density channel: the ingredient's PRIMARY class + density,
      // nested under `ingredient`, distinct from entryUnitClass above.
      expect(line.ingredient).toEqual({ unitClass: "MASS", densityGPerMl: 0.85 });
    });
  });

  describe("updateWithLines() — atomic line replacement", () => {
    it("replaces recipe fields and swaps the entire line set", async () => {
      const created = await recipeRepo.createWithLines(db, twoLineRecipeInput());

      const updated = await recipeRepo.updateWithLines(db, created.id, {
        name: "Chicken and Rice (updated)",
        servings: 6,
        instructions: "Cook it longer.",
        lines: [
          {
            ingredientId: chickenId,
            quantityCanonical: 500,
            entryUnitClass: "MASS" as const,
            displayQuantity: 500,
            displayUnit: "g",
          },
        ],
      });

      expect(updated.name).toBe("Chicken and Rice (updated)");
      expect(updated.servings).toBe(6);
      expect(updated.lines).toHaveLength(1);
      expect(updated.lines[0].ingredientId).toBe(chickenId);
      expect(updated.lines[0].quantityCanonical).toBe(500);

      const oldLineIds = created.lines.map((l) => l.id);
      const newLineIds = updated.lines.map((l) => l.id);
      expect(newLineIds.some((id) => oldLineIds.includes(id))).toBe(false);

      expect(countRows(sqlite, "recipe_line")).toBe(1);
    });
  });

  describe("remove()", () => {
    it("cascades recipe_line rows but leaves ingredient and pantry_item untouched", async () => {
      const created = await recipeRepo.createWithLines(db, twoLineRecipeInput());

      await recipeRepo.remove(db, created.id);

      expect(countRows(sqlite, "recipe")).toBe(0);
      expect(countRows(sqlite, "recipe_line")).toBe(0);
      expect(countRows(sqlite, "ingredient")).toBe(2);
    });
  });

  describe("returned shapes are plain domain objects (no Drizzle row metadata)", () => {
    it("createWithLines() line records carry exactly the documented fields", async () => {
      const created = await recipeRepo.createWithLines(db, twoLineRecipeInput());
      expect(Object.keys(created.lines[0]).sort()).toEqual(
        ["id", "recipeId", "ingredientId", "quantityCanonical", "entryUnitClass", "displayQuantity", "displayUnit"].sort(),
      );
    });
  });
});
