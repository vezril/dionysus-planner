import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient } from "./support/rawFixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** openspec: nutrition-intake — the editor's live preview action: same
 * math as a saved recipe, targets riding along, null while mid-typing. */
describe("previewRecipeNutrition", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  let oatsId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-preview-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    vi.resetModules();
    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    oatsId = insertRawIngredient(sqlite, {
      name: "Preview Oats",
      unitClass: "MASS",
      caloriesPerRef: 400,
      proteinPerRef: 12,
      carbsPerRef: 68,
      fatPerRef: 8,
    });
    sqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("computes per-serving totals with the resolved targets attached", async () => {
    const { previewRecipeNutrition } = await import("@/app/actions/recipe-actions");
    const result = await previewRecipeNutrition({
      body: `Soak @Preview Oats(${oatsId}){250%g} overnight.`,
      servings: 4,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).not.toBeNull();
    // 400 kcal/100 g × 250 g = 1000 kcal ÷ 4 servings.
    expect(result.data!.perServing.calories.value).toBe(250);
    expect(result.data!.perServing.protein.value).toBe(7.5);
    expect(result.data!.targets.caloriesKcal).toBe(2500);
  });

  it("mid-typing bodies (no complete mention, parse errors) preview as null", async () => {
    const { previewRecipeNutrition } = await import("@/app/actions/recipe-actions");
    for (const body of ["", "Soak @Preview", `Soak @Preview Oats(${oatsId}){250%parsecs}`]) {
      const result = await previewRecipeNutrition({ body, servings: 4 });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toBeNull();
    }
    const badServings = await previewRecipeNutrition({ body: `@Preview Oats(${oatsId}){250%g}`, servings: 0 });
    expect(badServings.ok && badServings.data === null).toBe(true);
  });

  it("an unknown ingredient id previews as incomplete, never a fake zero", async () => {
    const { previewRecipeNutrition } = await import("@/app/actions/recipe-actions");
    const result = await previewRecipeNutrition({ body: "Add @Ghost(99999){10%g} to taste.", servings: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data!.perServing.calories.value).toBeNull();
  });
});
