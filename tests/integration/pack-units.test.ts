import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient } from "./support/rawFixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** openspec: pack-units — {1%pack} mentions expand through the product's
 * pack size at save time (display kept verbatim), fail helpfully without
 * one, and preview identically. */
describe("pack units in recipes", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  let oatmealId: number;
  let riceId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-packs-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    vi.resetModules();
    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    oatmealId = insertRawIngredient(sqlite, {
      name: "Pack Oatmeal",
      unitClass: "MASS",
      caloriesPerRef: 380,
      packageQuantity: 366,
      packageUnit: "g",
    });
    sqlite.prepare("UPDATE ingredient SET packQuantity = 61, packUnit = 'g' WHERE id = ?").run(oatmealId);
    riceId = insertRawIngredient(sqlite, { name: "Pack Rice Plain", unitClass: "MASS", caloriesPerRef: 360 });
    sqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saves {2%packs} as 122 g canonical with the pack phrasing displayed", async () => {
    const { createRecipe } = await import("@/app/actions/recipe-actions");
    const result = await createRecipe({
      name: "Overnight oats",
      servings: 2,
      body: `Soak @Pack Oatmeal(${oatmealId}){2%packs} overnight.`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lines[0]).toMatchObject({
      quantityCanonical: 122,
      entryUnitClass: "MASS",
      displayQuantity: 2,
      displayUnit: "packs",
    });
  });

  it("a pack mention on a product without a pack size names the fix", async () => {
    const { createRecipe } = await import("@/app/actions/recipe-actions");
    const result = await createRecipe({
      name: "Rice bowl",
      servings: 1,
      body: `Cook @Pack Rice Plain(${riceId}){1%pack} gently.`,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldErrors?.body?.[0]).toContain("Pack size");
  });

  it("the live preview prices pack mentions at their expanded size", async () => {
    const { previewRecipeNutrition } = await import("@/app/actions/recipe-actions");
    const result = await previewRecipeNutrition({
      body: `Soak @Pack Oatmeal(${oatmealId}){1%pack} overnight.`,
      servings: 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 380 kcal/100 g × 61 g = 231.8 kcal.
    expect(result.data!.perServing.calories.value).toBeCloseTo(231.8, 5);
  });

  it("createIngredient persists pack size fields", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await createIngredient({
      name: "Pack Granola",
      unitClass: "MASS",
      caloriesPerRef: 450,
      proteinPerRef: 10,
      carbsPerRef: 60,
      fatPerRef: 15,
      packageQuantity: 500,
      packageUnit: "g",
      packQuantity: 40,
      packUnit: "g",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { getIngredientRecordById } = await import("@/data/ingredients");
    const record = (await getIngredientRecordById(result.data.id))!;
    expect(record.packQuantity).toBe(40);
    expect(record.packUnit).toBe("g");
  });
});
