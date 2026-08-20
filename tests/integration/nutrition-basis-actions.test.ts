import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * openspec: nutrition-basis-and-edit — the Server Actions convert
 * label-basis nutrition to per-reference before persisting. Absent basis
 * behaves exactly as before (every pre-existing action test doubles as the
 * back-compat proof); a cross-class basis is a fieldErrors.nutritionBasisUnit
 * rejection that writes nothing.
 */
describe("nutrition basis conversion in actions", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-basis-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    vi.resetModules();

    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);
    setupSqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  const sodaCan = {
    name: "Cola",
    unitClass: "VOLUME",
    caloriesPerRef: 150,
    proteinPerRef: 0,
    carbsPerRef: 39,
    fatPerRef: 0,
    sugarPerRef: 39,
    sodiumMgPerRef: 30,
    nutritionBasisQuantity: 355,
    nutritionBasisUnit: "mL",
  };

  it("createIngredient scales per-355 mL label values to per-100 mL", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await createIngredient(sodaCan);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.caloriesPerRef).toBe(42.2535);
      expect(result.data.carbsPerRef).toBe(10.9859);
      expect(result.data.sodiumMgPerRef).toBe(8.4507);
      expect(result.data.fiberPerRef).toBeNull();
    }
  });

  it("createCustomPantryItem scales the same way and still creates both rows", async () => {
    const { createCustomPantryItem } = await import("@/app/actions/custom-pantry-item-actions");
    const result = await createCustomPantryItem({
      ...sodaCan,
      initialQuantity: 355,
      unit: "mL",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ingredient.caloriesPerRef).toBe(42.2535);
      expect(result.data.item.displayQuantity).toBe(355);
    }
  });

  it("overrideIngredientNutrition converts on edit too", async () => {
    const { createIngredient, overrideIngredientNutrition } = await import(
      "@/app/actions/ingredient-actions"
    );
    const created = await createIngredient({ ...sodaCan, nutritionBasisQuantity: undefined, nutritionBasisUnit: undefined });
    expect(created.ok).toBe(true);
    const id = created.ok ? created.data.id : -1;

    const result = await overrideIngredientNutrition(id, sodaCan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.caloriesPerRef).toBe(42.2535);
    }
  });

  it("a cross-class basis is rejected on nutritionBasisUnit and writes nothing", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await createIngredient({ ...sodaCan, unitClass: "MASS" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.fieldErrors?.nutritionBasisUnit?.[0]).toMatch(/unit class/i);
    }
    const sqlite = new Database(dbPath);
    const n = (sqlite.prepare("SELECT COUNT(*) AS n FROM ingredient").get() as { n: number }).n;
    sqlite.close();
    expect(n).toBe(0);
  });

  it("an absent basis persists values unchanged (back-compat)", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await createIngredient({
      ...sodaCan,
      nutritionBasisQuantity: undefined,
      nutritionBasisUnit: undefined,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.caloriesPerRef).toBe(150);
    }
  });
});
