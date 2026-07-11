import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient, insertRawRecipe, insertRawRecipeLine } from "./support/rawFixtures";

/**
 * S-403 Recipe detail with computed nutrition — data-assembly wiring
 * (docs/stories/S-403-recipe-detail-nutrition.md's first TEST task,
 * architecture.md §6 Flow B: `recipeRepo.getWithLinesAndIngredients` ->
 * `domain/nutrition.computeRecipeNutrition`, ADR-011 no caching).
 *
 * `data/recipes.ts` does not yet export `getRecipeDetail` — every test
 * below is intentionally RED (module has no such export) until the
 * implementer builds it. This is a WIRING check only: it pins that the
 * shape `recipeRepo.getWithLinesAndIngredients` returns folds correctly
 * into `computeRecipeNutrition`'s `ingredientsById` input and that the
 * result is threaded straight through — NOT a re-test of the nutrition
 * math itself (that's `tests/unit/domain/nutrition.test.ts`'s job, S-103).
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * `data/recipes.ts`:
 *
 * export async function getRecipeDetail(id: number): Promise<{
 *   recipe: RecipeRecord;                                   // from recipeRepo
 *   lines: Array<RecipeLineRecord & { ingredient: IngredientRecord }>;
 *   nutrition: RecipeNutrition;                             // domain/nutrition.ts
 * } | null>
 *
 * - Returns `null` for a nonexistent recipe id (mirrors
 *   `recipeRepo.getWithLinesAndIngredients`'s own null-for-missing-id
 *   contract) — this is what the RSC page loader calls `notFound()` on.
 * - `lines` is the SAME array `getWithLinesAndIngredients` returns (each
 *   line still carries its full constituent `ingredient`, including
 *   `displayQuantity`/`displayUnit` verbatim per FR-9) — the page needs
 *   this to render each line's name + originally-entered quantity/unit,
 *   separately from the nutrition computation.
 * - `nutrition` is exactly `computeRecipeNutrition(recipeShape,
 *   ingredientsById)`'s return value, where `ingredientsById` is built by
 *   indexing `lines[].ingredient` by id and `recipeShape.lines` map each
 *   line's `{ id, ingredientId, quantityCanonical, entryUnitClass }`.
 * - Fresh per call — no caching (ADR-011): calling `getRecipeDetail`
 *   again after an ingredient override reflects the new values with zero
 *   invalidation step (verified end-to-end by
 *   tests/e2e/recipe-detail.spec.ts; this suite only pins the wiring).
 * ===========================================================================
 */
describe("data/recipes#getRecipeDetail", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  let chickenId: number;
  let riceId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-recipe-detail-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;

    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);

    chickenId = insertRawIngredient(setupSqlite, {
      name: "Chicken Breast",
      unitClass: "MASS",
      caloriesPerRef: 165,
      proteinPerRef: 31,
      carbsPerRef: 0,
      fatPerRef: 3.6,
    });
    riceId = insertRawIngredient(setupSqlite, {
      name: "Rice",
      unitClass: "MASS",
      densityGPerMl: 0.85,
      caloriesPerRef: 130,
      proteinPerRef: 2.7,
      carbsPerRef: 28,
      fatPerRef: 0.3,
    });

    setupSqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  async function loadGetRecipeDetail() {
    const mod = await import("@/data/recipes");
    return mod.getRecipeDetail;
  }

  describe("a fixture recipe with two fully-resolved lines and no optional fields set", () => {
    function seedFixtureRecipe(servings: number): number {
      const setupSqlite = new Database(dbPath);
      const recipeId = insertRawRecipe(setupSqlite, { name: "Chicken and Rice", servings, instructions: "Cook it." });
      insertRawRecipeLine(setupSqlite, recipeId, chickenId, {
        quantityCanonical: 400,
        entryUnitClass: "MASS",
        displayQuantity: 400,
        displayUnit: "g",
      });
      insertRawRecipeLine(setupSqlite, recipeId, riceId, {
        quantityCanonical: 300,
        entryUnitClass: "MASS",
        displayQuantity: 300,
        displayUnit: "g",
      });
      setupSqlite.close();
      return recipeId;
    }

    it("returns the recipe metadata and each line's ingredient name + verbatim display quantity/unit (FR-9)", async () => {
      const getRecipeDetail = await loadGetRecipeDetail();
      const recipeId = seedFixtureRecipe(4);

      const result = await getRecipeDetail(recipeId);

      expect(result).not.toBeNull();
      expect(result!.recipe.name).toBe("Chicken and Rice");
      expect(result!.recipe.servings).toBe(4);
      expect(result!.recipe.instructions).toBe("Cook it.");
      expect(result!.lines).toHaveLength(2);

      const chickenLine = result!.lines.find((l: { ingredientId: number }) => l.ingredientId === chickenId)!;
      expect(chickenLine.ingredient.name).toBe("Chicken Breast");
      expect(chickenLine.displayQuantity).toBe(400);
      expect(chickenLine.displayUnit).toBe("g");

      const riceLine = result!.lines.find((l: { ingredientId: number }) => l.ingredientId === riceId)!;
      expect(riceLine.ingredient.name).toBe("Rice");
      expect(riceLine.displayQuantity).toBe(300);
      expect(riceLine.displayUnit).toBe("g");
    });

    it("computes totals matching a hand calculation (400g chicken + 300g rice, within 0.5% pre-rounding, FR-17/NFR-7)", async () => {
      const getRecipeDetail = await loadGetRecipeDetail();
      const recipeId = seedFixtureRecipe(4);

      const result = await getRecipeDetail(recipeId);

      // Hand calculation: chicken scale = 400/100 = 4, rice scale = 300/100 = 3.
      //   calories = 165*4 + 130*3 = 660 + 390 = 1050
      //   protein  =  31*4 + 2.7*3 = 124 + 8.1  = 132.1
      //   carbs    =   0*4 +  28*3 =   0 + 84   =  84
      //   fat      = 3.6*4 + 0.3*3 = 14.4 + 0.9  =  15.3
      const totals = result!.nutrition.totals;
      expect(totals.calories.incomplete).toBe(false);
      expect(totals.calories.value).toBeCloseTo(1050, 1);
      expect(totals.protein.value).toBeCloseTo(132.1, 1);
      expect(totals.carbs.value).toBeCloseTo(84, 1);
      expect(totals.fat.value).toBeCloseTo(15.3, 1);
    });

    it("computes per-serving = totals / servings (FR-18) — doubles when servings halves, without changing totals", async () => {
      const getRecipeDetail = await loadGetRecipeDetail();
      const fourServingsId = seedFixtureRecipe(4);
      const twoServingsId = seedFixtureRecipe(2);

      const fourServings = await getRecipeDetail(fourServingsId);
      const twoServings = await getRecipeDetail(twoServingsId);

      expect(fourServings!.nutrition.totals.calories.value).toBeCloseTo(1050, 1);
      expect(twoServings!.nutrition.totals.calories.value).toBeCloseTo(1050, 1);

      expect(fourServings!.nutrition.perServing.calories.value).toBeCloseTo(1050 / 4, 1);
      expect(twoServings!.nutrition.perServing.calories.value).toBeCloseTo(1050 / 2, 1);
      // Halving servings doubles the per-serving value.
      expect(twoServings!.nutrition.perServing.calories.value).toBeCloseTo(
        fourServings!.nutrition.perServing.calories.value! * 2,
        1,
      );
    });

    it("flags optional fields (fiber/sugar/sodium) incomplete when neither constituent ingredient sets them, never as 0 (FR-19)", async () => {
      const getRecipeDetail = await loadGetRecipeDetail();
      const recipeId = seedFixtureRecipe(4);

      const result = await getRecipeDetail(recipeId);

      for (const key of ["fiber", "sugar", "sodiumMg"] as const) {
        expect(result!.nutrition.totals[key].incomplete, `${key} should be incomplete`).toBe(true);
        expect(result!.nutrition.totals[key].value, `${key} value must be null, never 0`).toBeNull();
      }
    });
  });

  it("flags required-macro totals incomplete (never 0) and records the offending line id when a line is unresolved (FR-11/FR-19)", async () => {
    const getRecipeDetail = await loadGetRecipeDetail();

    const setupSqlite = new Database(dbPath);
    // Tofu is MASS-primary with no density set — entering a line in cups
    // (VOLUME) against it cannot be resolved (domain/units.ts).
    const tofuId = insertRawIngredient(setupSqlite, {
      name: "Tofu",
      unitClass: "MASS",
      caloriesPerRef: 76,
      proteinPerRef: 8,
      carbsPerRef: 1.9,
      fatPerRef: 4.8,
    });
    const recipeId = insertRawRecipe(setupSqlite, { name: "Broken Bowl", servings: 2 });
    const chickenLineId = insertRawRecipeLine(setupSqlite, recipeId, chickenId, {
      quantityCanonical: 400,
      entryUnitClass: "MASS",
      displayQuantity: 400,
      displayUnit: "g",
    });
    const tofuLineId = insertRawRecipeLine(setupSqlite, recipeId, tofuId, {
      quantityCanonical: 240,
      entryUnitClass: "VOLUME",
      displayQuantity: 1,
      displayUnit: "cup",
    });
    setupSqlite.close();

    const result = await getRecipeDetail(recipeId);

    for (const key of ["calories", "protein", "carbs", "fat"] as const) {
      expect(result!.nutrition.totals[key].incomplete, `${key} should be incomplete`).toBe(true);
      expect(result!.nutrition.totals[key].value, `${key} value must be null, never 0`).toBeNull();
    }
    expect(result!.nutrition.unresolvedLineIds).toContain(tofuLineId);
    expect(result!.nutrition.unresolvedLineIds).not.toContain(chickenLineId);
  });

  it("returns null for a nonexistent recipe id (the page loader's notFound() trigger)", async () => {
    const getRecipeDetail = await loadGetRecipeDetail();

    expect(await getRecipeDetail(999_999)).toBeNull();
  });
});
