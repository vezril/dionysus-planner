import type Database from "better-sqlite3";

/**
 * S-503 NFR-3 scale/load fixture generator (docs/stories/S-503-e2e-
 * journeys-scale.md's "dataset-generation script under /tests,
 * deterministic seed for reproducibility" task). Shared by
 * `tests/integration/scale.test.ts` (times the Flow C scan directly) and
 * `tests/e2e/scale.spec.ts` (times real page loads against the same
 * dataset) so both exercise identical, reproducible data.
 *
 * Writes directly via raw SQL against an already-migrated (and, for the
 * e2e case, already-seeded) better-sqlite3 connection — mirrors
 * tests/integration/support/rawFixtures.ts's raw-insert pattern, scaled
 * up and made bulk-efficient (one transaction). Every generated row uses
 * MASS/"g" exclusively (toCanonicalFactor 1, no density needed) so
 * required/available/shortfall arithmetic is trivial to hand-verify
 * independently of domain/units.ts's conversion logic — this fixture is
 * about volume + classification correctness at scale, not conversion
 * correctness (that's domain/units.test.ts's job).
 *
 * Determinism: a fixed-seed PRNG (mulberry32) drives every "random" bulk
 * value, so re-running this generator against a fresh DB always produces
 * byte-identical bulk data — required for the "zero false positives on a
 * hand-verified fixture subset" acceptance criterion to be meaningful
 * (Success Criterion #2's counter-check) and for the perf numbers
 * recorded in test output to be comparable run over run.
 */

const FIXED_TIMESTAMP = "2026-01-01T00:00:00.000Z";
const SCALE_FIXTURE_SEED = 424242;

function mulberry32(seed: number): () => number {
  let state = seed;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ScaleFixtureOptions {
  /** Additional CUSTOM ingredients created on top of the 3 named hand-verified ones. Default 2000 (NFR-3). */
  customIngredientCount?: number;
  /** Total recipes, including the 3 hand-verified ones. Default 500 (NFR-3). */
  recipeCount?: number;
  /** Lines per BULK (non-fixture) recipe. Default 5 ("~5 lines each", NFR-3). */
  linesPerBulkRecipe?: number;
  /** Total pantry rows, including the 2 hand-verified ones (chicken/rice). Default 300 (NFR-3). */
  pantryItemCount?: number;
}

/** The small, by-hand-verifiable subset embedded in the bulk dataset (Success Criterion #2's counter-check). */
export interface HandVerifiedFixture {
  cookableRecipeName: string;
  cookableIngredientName: string;
  cookableRequiredG: number;
  cookablePantryG: number;
  nearMatchRecipeName: string;
  nearMatchIngredientName: string;
  nearMatchRequiredG: number;
  nearMatchPantryG: number;
  nearMatchShortfallG: number;
  missingRecipeName: string;
  missingIngredientName: string;
  missingRequiredG: number;
  ingredientCount: number;
  recipeCount: number;
  pantryItemCount: number;
}

/**
 * Populates `sqlite` (an already-migrated connection — for the e2e case,
 * one that has also already run the real seed at server boot) with the
 * NFR-3-scale dataset, inside one transaction. Returns the hand-verified
 * fixture's names/quantities so callers can assert against them without
 * hardcoding magic strings twice.
 */
export function generateScaleFixture(
  sqlite: Database.Database,
  options: ScaleFixtureOptions = {},
): HandVerifiedFixture {
  const customIngredientCount = options.customIngredientCount ?? 2000;
  const recipeCount = options.recipeCount ?? 500;
  const linesPerBulkRecipe = options.linesPerBulkRecipe ?? 5;
  const pantryItemCount = options.pantryItemCount ?? 300;

  const rand = mulberry32(SCALE_FIXTURE_SEED);

  const insertIngredient = sqlite.prepare(`
    INSERT INTO ingredient
      (seedKey, name, unitClass, densityGPerMl, caloriesPerRef, proteinPerRef, carbsPerRef, fatPerRef,
       fiberPerRef, sugarPerRef, sodiumMgPerRef, source, overridden, createdAt, updatedAt)
    VALUES (NULL, ?, 'MASS', NULL, ?, ?, ?, ?, NULL, NULL, NULL, 'CUSTOM', 0, ?, ?)
  `);
  const insertRecipe = sqlite.prepare(`
    INSERT INTO recipe (name, servings, instructions, createdAt, updatedAt)
    VALUES (?, 4, '', ?, ?)
  `);
  const insertLine = sqlite.prepare(`
    INSERT INTO recipe_line (recipeId, ingredientId, quantityCanonical, entryUnitClass, displayQuantity, displayUnit)
    VALUES (?, ?, ?, 'MASS', ?, 'g')
  `);
  const insertPantry = sqlite.prepare(`
    INSERT INTO pantry_item (ingredientId, quantityCanonical, entryUnitClass, displayQuantity, displayUnit, updatedAt)
    VALUES (?, ?, 'MASS', ?, 'g', ?)
  `);

  const cookableIngredientName = "Scale Fixture Chicken";
  const nearMatchIngredientName = "Scale Fixture Rice";
  const missingIngredientName = "Scale Fixture Broth";
  const cookableRecipeName = "Scale Fixture Cookable Recipe";
  const nearMatchRecipeName = "Scale Fixture Near Match Recipe";
  const missingRecipeName = "Scale Fixture Missing Recipe";

  const cookableRequiredG = 400;
  const cookablePantryG = 500;
  const nearMatchRequiredG = 300;
  const nearMatchPantryG = 100;
  const missingRequiredG = 300;

  const run = sqlite.transaction(() => {
    const chickenId = Number(
      insertIngredient.run(cookableIngredientName, 165, 31, 0, 3.6, FIXED_TIMESTAMP, FIXED_TIMESTAMP).lastInsertRowid,
    );
    const riceId = Number(
      insertIngredient.run(nearMatchIngredientName, 130, 2.7, 28, 0.3, FIXED_TIMESTAMP, FIXED_TIMESTAMP)
        .lastInsertRowid,
    );
    const brothId = Number(
      insertIngredient.run(missingIngredientName, 15, 1, 1, 0.5, FIXED_TIMESTAMP, FIXED_TIMESTAMP).lastInsertRowid,
    );

    const bulkIngredientIds: number[] = [];
    for (let i = 0; i < customIngredientCount; i += 1) {
      const cal = Math.round(rand() * 400 + 20);
      const protein = Math.round(rand() * 300) / 10;
      const carbs = Math.round(rand() * 600) / 10;
      const fat = Math.round(rand() * 200) / 10;
      const id = Number(
        insertIngredient.run(`Scale Ingredient ${i}`, cal, protein, carbs, fat, FIXED_TIMESTAMP, FIXED_TIMESTAMP)
          .lastInsertRowid,
      );
      bulkIngredientIds.push(id);
    }

    const cookableRecipeId = Number(
      insertRecipe.run(cookableRecipeName, FIXED_TIMESTAMP, FIXED_TIMESTAMP).lastInsertRowid,
    );
    insertLine.run(cookableRecipeId, chickenId, cookableRequiredG, cookableRequiredG);

    const nearMatchRecipeId = Number(
      insertRecipe.run(nearMatchRecipeName, FIXED_TIMESTAMP, FIXED_TIMESTAMP).lastInsertRowid,
    );
    insertLine.run(nearMatchRecipeId, riceId, nearMatchRequiredG, nearMatchRequiredG);

    const missingRecipeId = Number(
      insertRecipe.run(missingRecipeName, FIXED_TIMESTAMP, FIXED_TIMESTAMP).lastInsertRowid,
    );
    insertLine.run(missingRecipeId, brothId, missingRequiredG, missingRequiredG);

    const bulkRecipeCount = Math.max(0, recipeCount - 3);
    for (let r = 0; r < bulkRecipeCount; r += 1) {
      const recipeId = Number(insertRecipe.run(`Scale Recipe ${r}`, FIXED_TIMESTAMP, FIXED_TIMESTAMP).lastInsertRowid);
      for (let l = 0; l < linesPerBulkRecipe; l += 1) {
        const ingredientId = bulkIngredientIds[Math.floor(rand() * bulkIngredientIds.length)];
        const qty = Math.round(rand() * 500 + 10);
        insertLine.run(recipeId, ingredientId, qty, qty);
      }
    }

    // Hand-verified pantry rows: chicken well-stocked (cookable), rice
    // partially stocked (near-match, shortfall = required - pantry),
    // broth deliberately NEVER stocked (missing).
    insertPantry.run(chickenId, cookablePantryG, cookablePantryG, FIXED_TIMESTAMP);
    insertPantry.run(riceId, nearMatchPantryG, nearMatchPantryG, FIXED_TIMESTAMP);

    // Bulk pantry rows: a shuffled, non-repeating slice of bulk ingredient
    // ids (pantry_item.ingredientId is UNIQUE) — chicken/rice/broth are
    // never in this pool, so the hand-verified trio's classification can
    // never be perturbed by a bulk row landing on the same ingredient.
    const shuffled = [...bulkIngredientIds];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }

    const bulkPantryCount = Math.max(0, pantryItemCount - 2);
    for (let p = 0; p < bulkPantryCount; p += 1) {
      const ingredientId = shuffled[p];
      const qty = Math.round(rand() * 1000 + 10);
      insertPantry.run(ingredientId, qty, qty, FIXED_TIMESTAMP);
    }
  });

  run();

  return {
    cookableRecipeName,
    cookableIngredientName,
    cookableRequiredG,
    cookablePantryG,
    nearMatchRecipeName,
    nearMatchIngredientName,
    nearMatchRequiredG,
    nearMatchPantryG,
    nearMatchShortfallG: nearMatchRequiredG - nearMatchPantryG,
    missingRecipeName,
    missingIngredientName,
    missingRequiredG,
    ingredientCount: customIngredientCount + 3,
    recipeCount,
    pantryItemCount,
  };
}
