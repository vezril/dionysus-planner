import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient, insertRawPantryItem, insertRawRecipe, insertRawRecipeLine } from "./support/rawFixtures";

/**
 * S-501 "What Can I Cook" — page data-assembly wiring
 * (docs/stories/S-501-what-can-i-cook.md's first TEST task,
 * architecture.md §6 Flow C: `pantryRepo.getAllAsIndex` +
 * `recipeRepo.getAllWithLines` -> `domain/matching
 * .computeCookableAndNearMatch(pantryIndex, recipes, threshold)`,
 * threading straight through with the threshold resolved by the
 * app-layer `resolveDefaultThreshold()` helper this story owns, §4 OQ-1).
 *
 * This is a WIRING check only — it pins that the two-query fetch's shapes
 * (`PantryIndexEntry`, and `RecipeLine.ingredient.{unitClass,
 * densityGPerMl}` from the recipe join) fold correctly into
 * `computeCookableAndNearMatch`'s inputs, and that the env-resolved
 * threshold actually reaches that call and changes its output — NOT a
 * re-test of the ranking/shortfall math itself (that's
 * tests/unit/domain/matching.test.ts's job, S-104).
 *
 * Neither `data/whatCanICook.ts` nor `app/lib/threshold.ts` exists yet —
 * every test below is intentionally RED (module has no such export) until
 * the implementer builds them.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * `app/lib/threshold.ts`:
 *
 *   export function resolveDefaultThreshold(): number
 *
 *   - Reads `process.env.NEAR_MATCH_DEFAULT_THRESHOLD` AT CALL TIME (not
 *     module-load time — this suite calls it multiple times with
 *     different env values within one process and expects each call to
 *     reflect the env state at that moment).
 *   - Unset -> `3` (architecture §4 OQ-1's fallback default).
 *   - Set to a valid non-negative integer string (e.g. `"5"`) -> that
 *     number.
 *   - Set to a non-numeric/garbage string (e.g. `"banana"`) -> falls back
 *     to `3`, same as unset (never `NaN`, never throws).
 *   - Pure: no DB import, no Next.js import (consumed later by S-406 and
 *     S-502 per the story's Context).
 *
 * `data/whatCanICook.ts`:
 *
 *   export async function getWhatCanICook(threshold: number): Promise<MatchResult>
 *
 *   where `MatchResult` is `domain/matching.ts`'s existing exported type
 *   (`{ cookable, nearMatch, missingMoreCount }`) — re-exported or
 *   imported verbatim, not redefined.
 *
 *   - Opens its own connection via `createDb()` (mirrors `data/recipes
 *     .ts`'s `getRecipeDetail` per-call-connection pattern), calls
 *     `pantryRepo.getAllAsIndex(db)` and `recipeRepo.getAllWithLines(db)`
 *     — exactly those two repo functions, no others — then passes their
 *     results straight into `computeCookableAndNearMatch(pantryIndex,
 *     recipes, threshold)` and returns its result verbatim.
 *   - `threshold` is a required, explicit parameter (mirrors
 *     `computeCookableAndNearMatch`'s own contract — this function does
 *     NOT call `resolveDefaultThreshold()` itself; the caller
 *     (`app/what-can-i-cook/page.tsx`) resolves the default and passes it
 *     in, matching architecture §4 OQ-1's "domain/data layers never read
 *     process.env" spirit extended to this wiring function).
 * ===========================================================================
 */
describe("app/lib/threshold#resolveDefaultThreshold", () => {
  const originalEnv = process.env.NEAR_MATCH_DEFAULT_THRESHOLD;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NEAR_MATCH_DEFAULT_THRESHOLD;
    else process.env.NEAR_MATCH_DEFAULT_THRESHOLD = originalEnv;
  });

  async function loadResolveDefaultThreshold() {
    const mod = await import("@/app/lib/threshold");
    return mod.resolveDefaultThreshold;
  }

  it("falls back to 3 when NEAR_MATCH_DEFAULT_THRESHOLD is unset", async () => {
    delete process.env.NEAR_MATCH_DEFAULT_THRESHOLD;
    const resolveDefaultThreshold = await loadResolveDefaultThreshold();

    expect(resolveDefaultThreshold()).toBe(3);
  });

  it("uses the env value when it is set to a valid integer", async () => {
    process.env.NEAR_MATCH_DEFAULT_THRESHOLD = "5";
    const resolveDefaultThreshold = await loadResolveDefaultThreshold();

    expect(resolveDefaultThreshold()).toBe(5);
  });

  it("falls back to 3 when the env value is garbage (never NaN, never throws)", async () => {
    process.env.NEAR_MATCH_DEFAULT_THRESHOLD = "banana";
    const resolveDefaultThreshold = await loadResolveDefaultThreshold();

    expect(resolveDefaultThreshold()).toBe(3);
  });

  it("reflects a CHANGED env value on a later call within the same process (reads at call time, not import time)", async () => {
    delete process.env.NEAR_MATCH_DEFAULT_THRESHOLD;
    const resolveDefaultThreshold = await loadResolveDefaultThreshold();
    expect(resolveDefaultThreshold()).toBe(3);

    process.env.NEAR_MATCH_DEFAULT_THRESHOLD = "7";
    expect(resolveDefaultThreshold()).toBe(7);
  });
});

describe("data/whatCanICook#getWhatCanICook", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalThresholdEnv = process.env.NEAR_MATCH_DEFAULT_THRESHOLD;

  let chickenId: number;
  let riceId: number;
  let brothId: number;
  let garlicId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-wcic-data-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;

    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);

    // Pantry has chicken (plenty) and rice (a little) — broth and garlic
    // are absent from the pantry entirely (FR-20's "MISSING" case).
    chickenId = insertRawIngredient(setupSqlite, { name: "Chicken Breast", unitClass: "MASS" });
    riceId = insertRawIngredient(setupSqlite, { name: "Rice", unitClass: "MASS" });
    brothId = insertRawIngredient(setupSqlite, { name: "Broth", unitClass: "MASS" });
    garlicId = insertRawIngredient(setupSqlite, { name: "Garlic", unitClass: "MASS" });

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

    // Cookable: chicken 400g required, 500g held.
    const cookableRecipeId = insertRawRecipe(setupSqlite, { name: "Chicken Bowl" });
    insertRawRecipeLine(setupSqlite, cookableRecipeId, chickenId, {
      quantityCanonical: 400,
      entryUnitClass: "MASS",
      displayQuantity: 400,
      displayUnit: "g",
    });

    // Near-match, 1 unsatisfied line, partial (INSUFFICIENT): rice 300g
    // required, 100g held -> shortfall 200g, proportion 200/300.
    const riceSoupId = insertRawRecipe(setupSqlite, { name: "Rice Soup" });
    insertRawRecipeLine(setupSqlite, riceSoupId, riceId, {
      quantityCanonical: 300,
      entryUnitClass: "MASS",
      displayQuantity: 300,
      displayUnit: "g",
    });

    // Near-match, 1 unsatisfied line, fully MISSING (proportion 1.0):
    // broth 300g required, none held.
    const brothSoupId = insertRawRecipe(setupSqlite, { name: "Broth Soup" });
    insertRawRecipeLine(setupSqlite, brothSoupId, brothId, {
      quantityCanonical: 300,
      entryUnitClass: "MASS",
      displayQuantity: 300,
      displayUnit: "g",
    });

    // 2 unsatisfied lines (broth + garlic, both fully missing) — included
    // in near-match at the default threshold (3), but excluded (counted
    // in missingMoreCount) once threshold is narrowed to 1.
    const feastId = insertRawRecipe(setupSqlite, { name: "Garlic Broth Feast" });
    insertRawRecipeLine(setupSqlite, feastId, brothId, {
      quantityCanonical: 300,
      entryUnitClass: "MASS",
      displayQuantity: 300,
      displayUnit: "g",
    });
    insertRawRecipeLine(setupSqlite, feastId, garlicId, {
      quantityCanonical: 50,
      entryUnitClass: "MASS",
      displayQuantity: 50,
      displayUnit: "g",
    });

    setupSqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalThresholdEnv === undefined) delete process.env.NEAR_MATCH_DEFAULT_THRESHOLD;
    else process.env.NEAR_MATCH_DEFAULT_THRESHOLD = originalThresholdEnv;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  async function loadGetWhatCanICook() {
    const mod = await import("@/data/whatCanICook");
    return mod.getWhatCanICook;
  }

  async function loadResolveDefaultThreshold() {
    const mod = await import("@/app/lib/threshold");
    return mod.resolveDefaultThreshold;
  }

  it("cookable membership: a recipe fully satisfied by the pantry appears in `cookable`, non-cookable recipes do not (FR-20)", async () => {
    const getWhatCanICook = await loadGetWhatCanICook();

    const result = await getWhatCanICook(3);

    expect(result.cookable.map((r: { name: string }) => r.name)).toEqual(["Chicken Bowl"]);
    expect(result.nearMatch.map((r: { name: string }) => r.name)).not.toContain("Chicken Bowl");
  });

  it("near-match order: ties on unsatisfied-line count break by ascending mean shortfall proportion (FR-21)", async () => {
    const getWhatCanICook = await loadGetWhatCanICook();

    const result = await getWhatCanICook(3);

    // Rice Soup (proportion ~0.667) ranks before Broth Soup (proportion
    // 1.0) — both have exactly 1 unsatisfied line, so the tie-break
    // decides it. Garlic Broth Feast (2 unsatisfied lines) ranks last.
    expect(result.nearMatch.map((r: { name: string }) => r.name)).toEqual([
      "Rice Soup",
      "Broth Soup",
      "Garlic Broth Feast",
    ]);
  });

  it("shortfall payload: each near-match recipe's unsatisfied line carries the correct status/shortfall (FR-22)", async () => {
    const getWhatCanICook = await loadGetWhatCanICook();

    const result = await getWhatCanICook(3);

    const riceSoup = result.nearMatch.find((r: { name: string }) => r.name === "Rice Soup")!;
    expect(riceSoup.unsatisfiedLines).toHaveLength(1);
    expect(riceSoup.unsatisfiedLines[0]).toMatchObject({
      ingredientId: riceId,
      status: "INSUFFICIENT",
      shortfallDisplayQuantity: 200,
      displayUnit: "g",
    });

    const brothSoup = result.nearMatch.find((r: { name: string }) => r.name === "Broth Soup")!;
    expect(brothSoup.unsatisfiedLines).toHaveLength(1);
    expect(brothSoup.unsatisfiedLines[0]).toMatchObject({
      ingredientId: brothId,
      status: "MISSING",
      shortfallDisplayQuantity: 300,
      displayUnit: "g",
    });
  });

  it("missing-more count: at the default (env-unset -> 3) threshold, the 2-missing recipe is included in nearMatch, not counted", async () => {
    delete process.env.NEAR_MATCH_DEFAULT_THRESHOLD;
    const resolveDefaultThreshold = await loadResolveDefaultThreshold();
    const getWhatCanICook = await loadGetWhatCanICook();

    const result = await getWhatCanICook(resolveDefaultThreshold());

    expect(result.nearMatch.map((r: { name: string }) => r.name)).toContain("Garlic Broth Feast");
    expect(result.missingMoreCount).toBe(0);
  });

  it("missing-more count: narrowing the threshold via NEAR_MATCH_DEFAULT_THRESHOLD=1 excludes the 2-missing recipe and counts it (env flows all the way through)", async () => {
    process.env.NEAR_MATCH_DEFAULT_THRESHOLD = "1";
    const resolveDefaultThreshold = await loadResolveDefaultThreshold();
    const getWhatCanICook = await loadGetWhatCanICook();

    const result = await getWhatCanICook(resolveDefaultThreshold());

    expect(result.nearMatch.map((r: { name: string }) => r.name)).toEqual(["Rice Soup", "Broth Soup"]);
    expect(result.nearMatch.map((r: { name: string }) => r.name)).not.toContain("Garlic Broth Feast");
    expect(result.missingMoreCount).toBe(1);
  });
});
