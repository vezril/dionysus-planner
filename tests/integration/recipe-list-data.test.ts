import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient, insertRawPantryItem, insertRawRecipe, insertRawRecipeLine } from "./support/rawFixtures";

/**
 * S-406 recipe list annotation assembly — the FIRST TEST task of
 * docs/stories/S-406-recipe-list-sort-filter.md ("list annotation assembly
 * — fixture pantry + recipes: each recipe annotated with correct status
 * (cookable / near-match / missing-more per S-104 output and the active
 * default threshold) and calories/serving (or incomplete flag) — the
 * wiring, not the math (S-103/S-104 own the math)"), architecture.md §6
 * Flow D.
 *
 * This is a WIRING check only, same posture as
 * tests/integration/wcic-data.test.ts (S-501): it pins that a per-recipe
 * scan folds `pantryRepo.getAllAsIndex()` + `recipeRepo.getAllWithLines()`
 * through BOTH `domain/nutrition.computeRecipeNutrition` AND
 * `domain/matching.computeCookableAndNearMatch` and lands the right
 * classification/calories value on the right recipe — NOT a re-test of
 * either domain function's own math (that's tests/unit/domain/nutrition
 * .test.ts and tests/unit/domain/matching.test.ts's job, S-103/S-104).
 *
 * `data/recipes.ts` has no `listRecipeSummariesAnnotated` export yet (only
 * the existing, unannotated `listRecipeSummaries()` — S-401/S-404/S-405 —
 * which this story does NOT modify: `tests/integration/recipe-tags.test.ts`
 * already calls it with ZERO arguments and must stay green) — every test
 * below is intentionally RED (module resolves; the named export is
 * `undefined`) until the implementer adds this new function per this file's
 * pinned contract.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * `data/recipes.ts`:
 *
 *   export type CookabilityStatus = "COOKABLE" | "NEAR_MATCH" | "MISSING_MORE";
 *
 *   export interface AnnotatedRecipeSummary extends RecipeSummary {
 *     servings: number;
 *     caloriesPerServing: number | null;
 *     cookability: CookabilityStatus;
 *   }
 *
 *   export async function listRecipeSummariesAnnotated(
 *     threshold: number,
 *   ): Promise<AnnotatedRecipeSummary[]>
 *
 *   - `threshold` is a required, explicit parameter (mirrors
 *     `data/whatCanICook.ts#getWhatCanICook`'s own contract) — this
 *     function does NOT call `resolveDefaultThreshold()` itself; the
 *     caller (`app/recipes/page.tsx`) resolves the default and passes it
 *     in (architecture §4 OQ-1's "domain/data layers never read
 *     process.env" spirit extended to this wiring function).
 *   - `servings` is that recipe's own `servings` field (verbatim).
 *   - `caloriesPerServing` is `domain/nutrition.computeRecipeNutrition(...)
 *     .perServing.calories.value` for that recipe — a plain `number` when
 *     complete, `null` when ANY line's quantity resolves to `'UNRESOLVED'`
 *     (FR-19 "incomplete" case, same rule `getRecipeDetail`'s nutrition
 *     already follows for the detail page) — never a rounded/formatted
 *     string (formatting is `formatNutritionForDisplay`'s job, a display
 *     boundary concern the list annotation itself does not own).
 *   - `cookability` is derived from `computeCookableAndNearMatch(pantryIndex,
 *     recipes, threshold)`'s categorization of THIS recipe: `"COOKABLE"`
 *     when it appears in `result.cookable`, `"NEAR_MATCH"` when it appears
 *     in `result.nearMatch`, `"MISSING_MORE"` otherwise (i.e. every recipe
 *     the domain function did not place in either list, contributing to
 *     `result.missingMoreCount` instead) — every recipe gets exactly one of
 *     these three values, never a 4th value, never omitted.
 *   - `caloriesPerServing` and `cookability` are computed INDEPENDENTLY: a
 *     recipe can be nutrition-incomplete (`caloriesPerServing: null`) while
 *     still being classified `"NEAR_MATCH"` (or vice versa) — nutrition
 *     completeness has no bearing on cookability classification.
 *   - Every recipe in the DB is returned (this function does not filter,
 *     sort, or paginate — client-side sort/filter is `domain/listFilters
 *     .ts#sortRecipes`/`matchesStatus`'s job, S-406's OTHER test file); the
 *     RETURN ORDER is not asserted here.
 * ===========================================================================
 */
describe("data/recipes#listRecipeSummariesAnnotated", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  let chickenId: number;
  let riceId: number;
  let brothId: number;
  let garlicId: number;
  let eggId: number;
  let flourId: number;
  let weirdId: number;

  const COOKABLE_NAME = "Cookable Chicken Bowl";
  const NEAR_MATCH_NAME = "Near Match Rice Soup";
  const MISSING_MORE_NAME = "Missing More Feast";
  const INCOMPLETE_NUTRITION_NAME = "Incomplete Nutrition Snack";

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-recipe-list-data-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;

    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);

    chickenId = insertRawIngredient(setupSqlite, {
      name: "Chicken Breast",
      unitClass: "MASS",
      caloriesPerRef: 200,
      proteinPerRef: 20,
      carbsPerRef: 0,
      fatPerRef: 5,
    });
    riceId = insertRawIngredient(setupSqlite, {
      name: "Rice",
      unitClass: "MASS",
      caloriesPerRef: 130,
      proteinPerRef: 2.7,
      carbsPerRef: 28,
      fatPerRef: 0.3,
    });
    brothId = insertRawIngredient(setupSqlite, { name: "Broth", unitClass: "MASS" });
    garlicId = insertRawIngredient(setupSqlite, { name: "Garlic", unitClass: "MASS" });
    eggId = insertRawIngredient(setupSqlite, { name: "Egg", unitClass: "MASS" });
    flourId = insertRawIngredient(setupSqlite, { name: "Flour", unitClass: "MASS" });
    // MASS-primary with NO density — entering a line in a VOLUME unit for
    // this ingredient cannot be resolved (mirrors "Tomatoes, cherry" in
    // tests/e2e/recipe-detail.spec.ts), forcing FR-19's incomplete case.
    weirdId = insertRawIngredient(setupSqlite, {
      name: "Undensified Paste",
      unitClass: "MASS",
      densityGPerMl: null,
      caloriesPerRef: 999,
    });

    // Pantry: chicken plenty (500 g), rice a little (100 g). Broth, garlic,
    // egg, flour, and the undensified paste are never stocked at all.
    insertRawPantryItem(setupSqlite, chickenId, {
      quantityCanonical: 500,
      entryUnitClass: "MASS",
      displayQuantity: 500,
      displayUnit: "g",
    });
    insertRawPantryItem(setupSqlite, riceId, {
      quantityCanonical: 100,
      entryUnitClass: "MASS",
      displayQuantity: 100,
      displayUnit: "g",
    });

    // Cookable: chicken 400 g required, 500 g held. servings=2.
    // calories = 200 * (400/100) = 800; per-serving = 800/2 = 400.
    const cookableId = insertRawRecipe(setupSqlite, { name: COOKABLE_NAME, servings: 2 });
    insertRawRecipeLine(setupSqlite, cookableId, chickenId, {
      quantityCanonical: 400,
      entryUnitClass: "MASS",
      displayQuantity: 400,
      displayUnit: "g",
    });

    // Near-match: rice 300 g required, 100 g held -> 1 unsatisfied line,
    // within the default threshold (3). servings=1.
    // calories = 130 * (300/100) = 390; per-serving = 390/1 = 390.
    const nearMatchId = insertRawRecipe(setupSqlite, { name: NEAR_MATCH_NAME, servings: 1 });
    insertRawRecipeLine(setupSqlite, nearMatchId, riceId, {
      quantityCanonical: 300,
      entryUnitClass: "MASS",
      displayQuantity: 300,
      displayUnit: "g",
    });

    // Missing-more (at the default threshold of 3): 4 unstocked ingredients
    // -> 4 unsatisfied lines, exceeding the default threshold.
    const missingMoreId = insertRawRecipe(setupSqlite, { name: MISSING_MORE_NAME, servings: 4 });
    for (const ingredientId of [brothId, garlicId, eggId, flourId]) {
      insertRawRecipeLine(setupSqlite, missingMoreId, ingredientId, {
        quantityCanonical: 50,
        entryUnitClass: "MASS",
        displayQuantity: 50,
        displayUnit: "g",
      });
    }

    // Incomplete nutrition: the undensified-paste line is entered in a
    // VOLUME unit (cup) against a MASS-primary, density-less ingredient ->
    // nutrition UNRESOLVED -> caloriesPerServing null. Never stocked in the
    // pantry either -> 1 unsatisfied (MISSING) line, within the default
    // threshold -> NEAR_MATCH, independently of the nutrition outcome.
    const incompleteId = insertRawRecipe(setupSqlite, { name: INCOMPLETE_NUTRITION_NAME, servings: 2 });
    insertRawRecipeLine(setupSqlite, incompleteId, weirdId, {
      quantityCanonical: 240,
      entryUnitClass: "VOLUME",
      displayQuantity: 1,
      displayUnit: "cup",
    });

    setupSqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  async function loadListRecipeSummariesAnnotated() {
    const mod = await import("@/data/recipes");
    return mod.listRecipeSummariesAnnotated;
  }

  function findByName<T extends { name: string }>(items: T[], name: string): T {
    const found = items.find((item) => item.name === name);
    expect(found, `expected an annotated summary named "${name}"`).toBeDefined();
    return found!;
  }

  it("returns one annotated summary per recipe in the DB", async () => {
    const listRecipeSummariesAnnotated = await loadListRecipeSummariesAnnotated();

    const result = await listRecipeSummariesAnnotated(3);

    expect(result.map((entry) => entry.name).sort()).toEqual(
      [COOKABLE_NAME, NEAR_MATCH_NAME, MISSING_MORE_NAME, INCOMPLETE_NUTRITION_NAME].sort(),
    );
  });

  it("cookability: a fully-satisfied recipe is annotated COOKABLE", async () => {
    const listRecipeSummariesAnnotated = await loadListRecipeSummariesAnnotated();
    const result = await listRecipeSummariesAnnotated(3);

    const cookable = findByName(result, COOKABLE_NAME);
    expect(cookable.cookability).toBe("COOKABLE");
  });

  it("cookability: a partially-satisfied recipe (within threshold) is annotated NEAR_MATCH", async () => {
    const listRecipeSummariesAnnotated = await loadListRecipeSummariesAnnotated();
    const result = await listRecipeSummariesAnnotated(3);

    const nearMatch = findByName(result, NEAR_MATCH_NAME);
    expect(nearMatch.cookability).toBe("NEAR_MATCH");
  });

  it("cookability: a recipe beyond the active threshold is annotated MISSING_MORE, not NEAR_MATCH", async () => {
    const listRecipeSummariesAnnotated = await loadListRecipeSummariesAnnotated();
    const result = await listRecipeSummariesAnnotated(3);

    const missingMore = findByName(result, MISSING_MORE_NAME);
    expect(missingMore.cookability).toBe("MISSING_MORE");
  });

  it("cookability threshold flows through per recipe: widening the threshold moves the missing-more recipe into NEAR_MATCH", async () => {
    const listRecipeSummariesAnnotated = await loadListRecipeSummariesAnnotated();

    const atDefault = await listRecipeSummariesAnnotated(3);
    expect(findByName(atDefault, MISSING_MORE_NAME).cookability).toBe("MISSING_MORE");

    const atWidened = await listRecipeSummariesAnnotated(5);
    expect(findByName(atWidened, MISSING_MORE_NAME).cookability).toBe("NEAR_MATCH");
  });

  it("caloriesPerServing: a nutrition-complete recipe's value matches a hand calculation", async () => {
    const listRecipeSummariesAnnotated = await loadListRecipeSummariesAnnotated();
    const result = await listRecipeSummariesAnnotated(3);

    const cookable = findByName(result, COOKABLE_NAME);
    expect(cookable.servings).toBe(2);
    expect(cookable.caloriesPerServing).toBe(400);

    const nearMatch = findByName(result, NEAR_MATCH_NAME);
    expect(nearMatch.servings).toBe(1);
    expect(nearMatch.caloriesPerServing).toBe(390);
  });

  it("caloriesPerServing: a recipe with an UNRESOLVED line is null (FR-19), regardless of its cookability", async () => {
    const listRecipeSummariesAnnotated = await loadListRecipeSummariesAnnotated();
    const result = await listRecipeSummariesAnnotated(3);

    const incomplete = findByName(result, INCOMPLETE_NUTRITION_NAME);
    expect(incomplete.caloriesPerServing).toBeNull();
    // Independent of the (unrelated) nutrition incompleteness — this recipe
    // is still classified purely from pantry/threshold state.
    expect(incomplete.cookability).toBe("NEAR_MATCH");
  });

  it("every annotated summary still carries its own tags field (empty here — no tags were saved)", async () => {
    const listRecipeSummariesAnnotated = await loadListRecipeSummariesAnnotated();
    const result = await listRecipeSummariesAnnotated(3);

    const cookable = findByName(result, COOKABLE_NAME);
    expect(cookable.tags).toEqual([]);
  });
});
