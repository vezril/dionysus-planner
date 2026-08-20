import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** openspec: alcohol-tracking — alcohol persists through create, scales
 * with a nutrition basis, and stays null when absent. */
describe("alcohol through the actions", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-alcohol-test-${randomUUID()}-`));
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

  const beerCan = {
    name: "Beer, lager",
    unitClass: "VOLUME",
    caloriesPerRef: 150,
    proteinPerRef: 1.6,
    carbsPerRef: 13,
    fatPerRef: 0,
    alcoholGPerRef: 14,
    nutritionBasisQuantity: 355,
    nutritionBasisUnit: "mL",
  };

  it("createIngredient scales per-355 mL alcohol to per-100 mL", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await createIngredient(beerCan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.alcoholGPerRef).toBe(3.9437);
    }
  });

  it("an absent alcohol value stays null", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await createIngredient({
      ...beerCan,
      alcoholGPerRef: undefined,
      nutritionBasisQuantity: undefined,
      nutritionBasisUnit: undefined,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.alcoholGPerRef).toBeNull();
    }
  });
});

describe("ABV entry (openspec: batch-nutrition-and-abv-entry)", () => {
  it("a VOLUME drink's ABV converts to grams and ignores the nutrition basis", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await createIngredient({
      name: "ABV Beer",
      unitClass: "VOLUME",
      category: "DRINK",
      caloriesPerRef: 150,
      proteinPerRef: 1.6,
      carbsPerRef: 13,
      fatPerRef: 0,
      alcoholAbvPercent: 5,
      nutritionBasisQuantity: 355,
      nutritionBasisUnit: "mL",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Calories scale by the basis; ABV does not (a ratio).
      expect(result.data.caloriesPerRef).toBeCloseTo(42.2535, 4);
      expect(result.data.alcoholGPerRef).toBe(3.945);
    }
  });

  it("ABV on a MASS item is rejected on its own field", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await createIngredient({
      name: "ABV Bread",
      unitClass: "MASS",
      caloriesPerRef: 250,
      proteinPerRef: 9,
      carbsPerRef: 49,
      fatPerRef: 3,
      alcoholAbvPercent: 5,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fieldErrors?.alcoholAbvPercent).toBeDefined();
  });
});
