import { beforeEach, describe, expect, it, vi } from "vitest";
 
// is currently a placeholder (`export {}`, S-101 scaffold); this suite is
// intentionally RED until the S-202 implementer builds the named exports.
import * as recipeRepo from "@/data/repositories/recipeRepo";
import { createMigratedDrizzleDb, type MigratedDrizzleDb } from "../support/migratedDb";
import { insertRawIngredient, insertRawRecipe, insertRawRecipeLine } from "../support/rawFixtures";

/**
 * S-202 AC-4 / NFR-3 — anti-N+1 query-count guard.
 *
 * "Given `recipeRepo.getAllWithLines()`, when called with 500 recipes x 5
 * lines, then it issues one join query (no per-recipe queries)..."
 * (docs/stories/S-202-repositories.md AC-4). The story's own task list
 * scales this down to a 50-recipe fixture for test speed while still
 * proving the SHAPE of the risk (a per-recipe or per-line query would
 * show up as call count scaling with recipe/line count, not staying flat).
 *
 * Mechanism: better-sqlite3's `Database#prepare` is the actual statement
 * boundary the drizzle-orm/better-sqlite3 driver calls into for every
 * query it runs, regardless of query-builder abstraction — spying on it
 * on the SAME underlying connection the repo's `db` wraps (see
 * `createMigratedDrizzleDb()`) gives a query-builder-agnostic statement
 * count.
 *
 * `data/repositories/recipeRepo.ts` is currently `export {}` — RED until
 * the implementer builds `getAllWithLines`/`getWithLinesAndIngredients`.
 */
describe("recipeRepo — query-count guard (AC-4, NFR-3 anti-N+1)", () => {
  const RECIPE_COUNT = 50;
  const LINES_PER_RECIPE = 5;
  const MAX_STATEMENTS = 2;

  let db: MigratedDrizzleDb;
  let sqlite: ReturnType<typeof createMigratedDrizzleDb>["sqlite"];
  let firstRecipeId: number;

  beforeEach(() => {
    ({ db, sqlite } = createMigratedDrizzleDb());

    const ingredientIds = Array.from({ length: LINES_PER_RECIPE }, (_, i) =>
      insertRawIngredient(sqlite, { name: `Ingredient ${i}` }),
    );

    for (let r = 0; r < RECIPE_COUNT; r++) {
      const recipeId = insertRawRecipe(sqlite, { name: `Recipe ${r}` });
      if (r === 0) firstRecipeId = recipeId;
      for (const ingredientId of ingredientIds) {
        insertRawRecipeLine(sqlite, recipeId, ingredientId);
      }
    }
  });

  it(`getAllWithLines() issues at most ${MAX_STATEMENTS} prepared statements across ${RECIPE_COUNT} recipes x ${LINES_PER_RECIPE} lines`, async () => {
    const prepareSpy = vi.spyOn(sqlite, "prepare");
    prepareSpy.mockClear();

    const all = await recipeRepo.getAllWithLines(db);

    expect(all).toHaveLength(RECIPE_COUNT);
    expect(
      prepareSpy.mock.calls.length,
      `expected <=${MAX_STATEMENTS} prepared statements, got ${prepareSpy.mock.calls.length} (per-recipe/per-line queries would scale with ${RECIPE_COUNT * LINES_PER_RECIPE} rows)`,
    ).toBeLessThanOrEqual(MAX_STATEMENTS);
  });

  it(`getWithLinesAndIngredients(id) issues at most ${MAX_STATEMENTS} prepared statements for a single recipe with ${LINES_PER_RECIPE} lines`, async () => {
    const prepareSpy = vi.spyOn(sqlite, "prepare");
    prepareSpy.mockClear();

    const found = await recipeRepo.getWithLinesAndIngredients(db, firstRecipeId);

    expect(found).not.toBeNull();
    expect(found!.lines).toHaveLength(LINES_PER_RECIPE);
    expect(
      prepareSpy.mock.calls.length,
      `expected <=${MAX_STATEMENTS} prepared statements, got ${prepareSpy.mock.calls.length}`,
    ).toBeLessThanOrEqual(MAX_STATEMENTS);
  });
});
