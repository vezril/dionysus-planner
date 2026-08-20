import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import {
  insertRawIngredient,
  insertRawPantryItem,
  insertRawRecipe,
  insertRawRecipeLine,
} from "./support/rawFixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * openspec: count-via-package-size — wiring check that the package fields
 * flow from the ingredient row through both data paths into
 * `resolveQuantityForComparison`'s bridge: recipe nutrition
 * (`getRecipeDetail`) and cookability (`getWhatCanICook`). The bridge math
 * itself is pinned in tests/unit/domain/packageBridge.test.ts.
 */
describe("package-size bridge wiring", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  let sodaId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-pkg-bridge-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    vi.resetModules();

    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);
    // Fanta: VOLUME, per-100 mL values, packaged as a 355 mL can.
    sodaId = insertRawIngredient(setupSqlite, {
      name: "Fanta, Pineapple",
      unitClass: "VOLUME",
      caloriesPerRef: 42,
      proteinPerRef: 0,
      carbsPerRef: 11,
      fatPerRef: 0,
      packageQuantity: 355,
      packageUnit: "mL",
    });
    setupSqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("a '1 each' recipe line on a packaged VOLUME ingredient gets nutrition (no unresolved)", async () => {
    const sqlite = new Database(dbPath);
    const recipeId = insertRawRecipe(sqlite, { name: "Fanta float", servings: 1 });
    const lineId = insertRawRecipeLine(sqlite, recipeId, sodaId, {
      quantityCanonical: 1,
      entryUnitClass: "COUNT",
      displayQuantity: 1,
      displayUnit: "each",
    });
    sqlite.close();

    const { getRecipeDetail } = await import("@/data/recipes");
    const detail = await getRecipeDetail(recipeId);

    expect(detail).not.toBeNull();
    expect(detail!.nutrition.unresolvedLineIds).not.toContain(lineId);
    // 1 can = 355 mL -> scale 3.55 over the per-100 mL reference.
    expect(detail!.nutrition.totals.calories.value).toBeCloseTo(42 * 3.55, 10);
    expect(detail!.nutrition.totals.calories.incomplete).toBe(false);
  });

  it("pantry stock of '1 each' satisfies a 300 mL recipe requirement (cookable)", async () => {
    const sqlite = new Database(dbPath);
    const recipeId = insertRawRecipe(sqlite, { name: "Soda reduction", servings: 1 });
    insertRawRecipeLine(sqlite, recipeId, sodaId, {
      quantityCanonical: 300,
      entryUnitClass: "VOLUME",
      displayQuantity: 300,
      displayUnit: "mL",
    });
    insertRawPantryItem(sqlite, sodaId, {
      quantityCanonical: 1,
      entryUnitClass: "COUNT",
      displayQuantity: 1,
      displayUnit: "each",
    });
    sqlite.close();

    const { getWhatCanICook } = await import("@/data/whatCanICook");
    const result = await getWhatCanICook(3);

    expect(result.cookable.map((r) => r.name)).toContain("Soda reduction");
  });

  it("without a package size the same shapes stay unresolved (back-compat)", async () => {
    const sqlite = new Database(dbPath);
    const plainId = insertRawIngredient(sqlite, {
      name: "Mystery syrup",
      unitClass: "VOLUME",
      caloriesPerRef: 42,
      proteinPerRef: 0,
      carbsPerRef: 11,
      fatPerRef: 0,
    });
    const recipeId = insertRawRecipe(sqlite, { name: "Mystery", servings: 1 });
    const lineId = insertRawRecipeLine(sqlite, recipeId, plainId, {
      quantityCanonical: 1,
      entryUnitClass: "COUNT",
      displayQuantity: 1,
      displayUnit: "each",
    });
    sqlite.close();

    const { getRecipeDetail } = await import("@/data/recipes");
    const detail = await getRecipeDetail(recipeId);

    expect(detail!.nutrition.unresolvedLineIds).toContain(lineId);
    expect(detail!.nutrition.totals.calories.value).toBeNull();
  });
});
