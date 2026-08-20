import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * openspec: vitamin-tracking — sparse rows through the actions: persist,
 * basis-scale, replace-set on edit, cascade on ingredient delete.
 */
describe("micronutrients through the actions", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-micro-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    vi.resetModules();

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    sqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  function rowsFor(ingredientId: number): Array<{ nutrientKey: string; amountPerRef: number }> {
    const sqlite = new Database(dbPath);
    const rows = sqlite
      .prepare("SELECT nutrientKey, amountPerRef FROM ingredient_micronutrient WHERE ingredientId = ? ORDER BY nutrientKey")
      .all(ingredientId) as Array<{ nutrientKey: string; amountPerRef: number }>;
    sqlite.close();
    return rows;
  }

  const supplement = {
    name: "Vitamin D3 1000 IU",
    unitClass: "COUNT",
    caloriesPerRef: 0,
    proteinPerRef: 0,
    carbsPerRef: 0,
    fatPerRef: 0,
    micronutrients: [{ key: "vitaminD", amountPerRef: 25 }],
  };

  it("createIngredient persists the rows; edit replace-sets them", async () => {
    const { createIngredient, overrideIngredientNutrition } = await import("@/app/actions/ingredient-actions");
    const created = await createIngredient(supplement);
    expect(created.ok).toBe(true);
    const id = created.ok ? created.data.id : -1;
    expect(rowsFor(id)).toEqual([{ nutrientKey: "vitaminD", amountPerRef: 25 }]);

    const edited = await overrideIngredientNutrition(id, {
      ...supplement,
      micronutrients: [
        { key: "vitaminD", amountPerRef: 50 },
        { key: "calcium", amountPerRef: 120 },
      ],
    });
    expect(edited.ok).toBe(true);
    expect(rowsFor(id)).toEqual([
      { nutrientKey: "calcium", amountPerRef: 120 },
      { nutrientKey: "vitaminD", amountPerRef: 50 },
    ]);
  });

  it("a nutrition basis scales micronutrient amounts (custom item path)", async () => {
    const { createCustomPantryItem } = await import("@/app/actions/custom-pantry-item-actions");
    const result = await createCustomPantryItem({
      name: "OJ carton",
      unitClass: "VOLUME",
      caloriesPerRef: 160,
      proteinPerRef: 2,
      carbsPerRef: 39,
      fatPerRef: 0,
      initialQuantity: 355,
      unit: "mL",
      nutritionBasisQuantity: 355,
      nutritionBasisUnit: "mL",
      micronutrients: [{ key: "vitaminC", amountPerRef: 60 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(rowsFor(result.data.ingredient.id)).toEqual([{ nutrientKey: "vitaminC", amountPerRef: 16.9014 }]);
    }
  });

  it("deleting the ingredient cascades its micronutrient rows", async () => {
    const { createIngredient, deleteIngredient } = await import("@/app/actions/ingredient-actions");
    const created = await createIngredient(supplement);
    const id = created.ok ? created.data.id : -1;
    expect(rowsFor(id)).toHaveLength(1);

    const deleted = await deleteIngredient(id);
    expect(deleted.ok).toBe(true);
    expect(rowsFor(id)).toHaveLength(0);
  });
});
