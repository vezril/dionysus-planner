import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "@/data/migrate";
import { generateScaleFixture, type HandVerifiedFixture } from "./support/scaleFixture";

/**
 * S-503 NFR-3 scale/perf verification (docs/stories/S-503-e2e-journeys-
 * scale.md's "TEST: (integration/perf, tests/integration/scale.test.ts)"
 * task; PRD §9 Success Criterion #2's counter-check: "Cookable Now
 * classification... zero false positives").
 *
 * Populates a real on-disk SQLite file (not `:memory:` — the NFR-3
 * acceptance criterion is about the actual query path, disk I/O
 * included) with the deterministic tests/support/scaleFixture.ts
 * dataset (2,000+ CUSTOM ingredients, 500 recipes averaging ~5 lines
 * each, 300 pantry items) and times `data/whatCanICook#getWhatCanICook`'s
 * full Flow C scan (architecture.md §6 Flow C: pantryRepo.getAllAsIndex
 * + recipeRepo.getAllWithLines -> domain/matching
 * .computeCookableAndNearMatch — exactly two queries, no per-recipe or
 * per-line query).
 *
 * OQ-4 note: this machine's timing is smoke-level evidence, not the
 * formal reference-hardware sign-off (architecture.md §4 "Modest,
 * bounded scale performance" estimates the compute itself at ~10-20ms —
 * two orders of magnitude under the 2s budget — so a near-miss here
 * would itself be a regression signal, not evidence the budget is
 * hardware-sensitive). The measured duration is logged via
 * `console.info` so it is visible in CI output for the readiness-gate
 * record, per the story's Dev Notes.
 */
describe("NFR-3 scale: Flow C scan at 2,000 ingredients / 500 recipes / 300 pantry items", () => {
  let tmpDir: string;
  let dbPath: string;
  let fixture: HandVerifiedFixture;
  const originalDbPath = process.env.DB_PATH;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-scale-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;

    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);
    fixture = generateScaleFixture(setupSqlite);
    setupSqlite.close();
  });

  afterAll(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  async function loadGetWhatCanICook() {
    const mod = await import("@/data/whatCanICook");
    return mod.getWhatCanICook;
  }

  it("dataset sanity: the generated fixture actually reaches NFR-3 scale (2,000+/500/300)", () => {
    const sqlite = new Database(dbPath, { readonly: true });
    try {
      const ingredientCount = (sqlite.prepare("SELECT COUNT(*) AS n FROM ingredient").get() as { n: number }).n;
      const recipeCount = (sqlite.prepare("SELECT COUNT(*) AS n FROM recipe").get() as { n: number }).n;
      const lineCount = (sqlite.prepare("SELECT COUNT(*) AS n FROM recipe_line").get() as { n: number }).n;
      const pantryCount = (sqlite.prepare("SELECT COUNT(*) AS n FROM pantry_item").get() as { n: number }).n;

      expect(ingredientCount).toBeGreaterThanOrEqual(2000);
      expect(recipeCount).toBe(500);
      expect(pantryCount).toBe(300);
      // Success Criterion #4's own floor ("Fixture recipes average >= 3
      // ingredient lines") re-applied to this scale dataset, not just the
      // Near-Match usefulness fixture.
      expect(lineCount / recipeCount).toBeGreaterThanOrEqual(3);
    } finally {
      sqlite.close();
    }
  });

  it("NFR-3: the full Cookable Now / Near Match scan completes in <=2s", async () => {
    const getWhatCanICook = await loadGetWhatCanICook();

    const start = performance.now();
    const result = await getWhatCanICook(3);
    const durationMs = performance.now() - start;

    // NFR-3 readiness-gate evidence, deliberately visible in CI output.
    console.info(
      `[NFR-3] Flow C scan (2,000+ ingredients / 500 recipes / 300 pantry items): ${durationMs.toFixed(1)}ms (budget: 2000ms)`,
    );

    expect(durationMs).toBeLessThanOrEqual(2000);
    // Sanity that the scan actually did something (not a vacuous fast no-op).
    expect(result.cookable.length + result.nearMatch.length + result.missingMoreCount).toBeGreaterThan(0);
  });

  it("Success Criterion #2 counter-check: zero false positives in Cookable Now on the hand-verified subset", async () => {
    const getWhatCanICook = await loadGetWhatCanICook();
    const result = await getWhatCanICook(3);

    const cookableNames = result.cookable.map((r) => r.name);
    expect(cookableNames).toContain(fixture.cookableRecipeName);
    // A recipe requiring MORE than the pantry holds, or an ingredient
    // never stocked at all, must NEVER appear as Cookable Now — the
    // literal false-positive this criterion guards against.
    expect(cookableNames).not.toContain(fixture.nearMatchRecipeName);
    expect(cookableNames).not.toContain(fixture.missingRecipeName);

    const nearMatch = result.nearMatch.find((r) => r.name === fixture.nearMatchRecipeName);
    expect(nearMatch).toBeDefined();
    expect(nearMatch!.unsatisfiedLines).toHaveLength(1);
    expect(nearMatch!.unsatisfiedLines[0]).toMatchObject({
      status: "INSUFFICIENT",
      shortfallDisplayQuantity: fixture.nearMatchShortfallG,
      displayUnit: "g",
    });

    const missing = result.nearMatch.find((r) => r.name === fixture.missingRecipeName);
    expect(missing).toBeDefined();
    expect(missing!.unsatisfiedLines).toHaveLength(1);
    expect(missing!.unsatisfiedLines[0]).toMatchObject({
      status: "MISSING",
      shortfallDisplayQuantity: fixture.missingRequiredG,
      displayUnit: "g",
    });
  });

  it("Success Criterion #2 counter-check, full-scan independent recomputation: EVERY recipe classified Cookable Now truly has every line satisfied by the raw pantry data (all 500 recipes, not just the 3 named fixtures)", async () => {
    const getWhatCanICook = await loadGetWhatCanICook();
    const result = await getWhatCanICook(3);

    // Independent re-derivation straight from the DB file — bypasses
    // domain/matching.ts entirely — a raw-SQL cross-check that the
    // domain layer's "cookable" classification is never wrong, across
    // the FULL 500-recipe scan (not only the 3 hand-picked fixtures
    // above), satisfying "speed must not come at the cost of
    // correctness" literally at this scale.
    const sqlite = new Database(dbPath, { readonly: true });
    try {
      const pantryRows = sqlite.prepare("SELECT ingredientId, quantityCanonical FROM pantry_item").all() as Array<{
        ingredientId: number;
        quantityCanonical: number;
      }>;
      const pantryByIngredient = new Map(pantryRows.map((row) => [row.ingredientId, row.quantityCanonical]));

      expect(result.cookable.length).toBeGreaterThan(0);

      for (const recipe of result.cookable) {
        const lines = sqlite
          .prepare("SELECT ingredientId, quantityCanonical FROM recipe_line WHERE recipeId = ?")
          .all(recipe.id) as Array<{ ingredientId: number; quantityCanonical: number }>;

        const requiredByIngredient = new Map<number, number>();
        for (const line of lines) {
          requiredByIngredient.set(
            line.ingredientId,
            (requiredByIngredient.get(line.ingredientId) ?? 0) + line.quantityCanonical,
          );
        }

        for (const [ingredientId, required] of requiredByIngredient) {
          const available = pantryByIngredient.get(ingredientId) ?? 0;
          expect(
            available,
            `recipe "${recipe.name}" (id ${recipe.id}) was classified Cookable Now but ingredient ${ingredientId} ` +
              `only has ${available}g available against ${required}g required — FALSE POSITIVE`,
          ).toBeGreaterThanOrEqual(required);
        }
      }
    } finally {
      sqlite.close();
    }
  });
});
