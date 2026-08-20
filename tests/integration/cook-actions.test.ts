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
 * openspec: cook-recipe-into-meals — cookRecipe orchestration against a
 * MOCKED service module: service payloads, mirror reuse, ignore/substitute,
 * service-failure-consumes-nothing, and consume-on-missing rejection. The
 * pure planning math is unit-tested; pantry tx math is pantry-consume's.
 */
const serviceMock = {
  ingredients: [] as Array<Record<string, unknown> & { id: number; name: string }>,
  recipes: [] as Array<Record<string, unknown> & { id: number; name: string }>,
  batches: [] as Array<Record<string, unknown> & { id: number }>,
  meals: [] as Array<Record<string, unknown>>,
  failAll: false,
  failMeals: false,
  nextId: 1000,
};

vi.mock("@/services/dionysusService", () => ({
  DionysusServiceError: class DionysusServiceError extends Error {},
  listIngredients: vi.fn(async () => {
    if (serviceMock.failAll) throw new Error("service unreachable");
    return serviceMock.ingredients;
  }),
  createIngredient: vi.fn(async (_baseUrl: string, input: Record<string, unknown>) => {
    if (serviceMock.failAll) throw new Error("service unreachable");
    const created = { ...input, id: serviceMock.nextId++ } as (typeof serviceMock.ingredients)[number];
    serviceMock.ingredients.push(created);
    return created;
  }),
  listRecipes: vi.fn(async () => {
    if (serviceMock.failAll) throw new Error("service unreachable");
    return serviceMock.recipes;
  }),
  createRecipe: vi.fn(async (_baseUrl: string, input: Record<string, unknown>) => {
    if (serviceMock.failAll) throw new Error("service unreachable");
    const created = { ...input, id: serviceMock.nextId++ } as (typeof serviceMock.recipes)[number];
    serviceMock.recipes.push(created);
    return created;
  }),
  createMeal: vi.fn(async (_baseUrl: string, input: Record<string, unknown>) => {
    if (serviceMock.failAll || serviceMock.failMeals) throw new Error("meal endpoint down");
    const created = { ...input, id: serviceMock.nextId++ };
    serviceMock.meals.push(created);
    return created;
  }),
  createBatch: vi.fn(async (_baseUrl: string, input: Record<string, unknown>) => {
    if (serviceMock.failAll) throw new Error("service unreachable");
    const created = { ...input, id: serviceMock.nextId++, remainingPortions: input.servingsMade };
    serviceMock.batches.push(created as (typeof serviceMock.batches)[number]);
    return created;
  }),
}));

describe("cookRecipe", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalServiceUrl = process.env.DIONYSUS_SERVICE_URL;

  let sodaId: number;
  let flourId: number;
  let recipeId: number;
  let sodaRowId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-cook-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.DIONYSUS_SERVICE_URL = "http://service.test";
    vi.resetModules();
    serviceMock.ingredients = [];
    serviceMock.recipes = [];
    serviceMock.batches = [];
    serviceMock.meals = [];
    serviceMock.failAll = false;
    serviceMock.failMeals = false;

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    // VOLUME soda, packaged 355 mL, per-100 mL nutrition.
    sodaId = insertRawIngredient(sqlite, {
      name: "Cook Test Soda",
      unitClass: "VOLUME",
      caloriesPerRef: 42,
      proteinPerRef: 0,
      carbsPerRef: 11,
      fatPerRef: 0,
      packageQuantity: 355,
      packageUnit: "mL",
    });
    flourId = insertRawIngredient(sqlite, { name: "Cook Test Flour", unitClass: "MASS", caloriesPerRef: 364 });
    // 2-serving recipe: 1 can of soda (COUNT line) + 100 g flour.
    recipeId = insertRawRecipe(sqlite, { name: "Cook Test Recipe", servings: 2 });
    insertRawRecipeLine(sqlite, recipeId, sodaId, {
      quantityCanonical: 1,
      entryUnitClass: "COUNT",
      displayQuantity: 1,
      displayUnit: "each",
    });
    insertRawRecipeLine(sqlite, recipeId, flourId, {
      quantityCanonical: 100,
      entryUnitClass: "MASS",
      displayQuantity: 100,
      displayUnit: "g",
    });
    // Pantry: 400 mL soda; NO flour row (missing).
    // openspec: meal-micronutrients — a sparse row the mirror must carry.
    sqlite
      .prepare("INSERT INTO ingredient_micronutrient (ingredientId, nutrientKey, amountPerRef) VALUES (?, ?, ?)")
      .run(sodaId, "vitaminC", 16.9014);
    sodaRowId = insertRawPantryItem(sqlite, sodaId, {
      quantityCanonical: 400,
      entryUnitClass: "VOLUME",
      displayQuantity: 400,
      displayUnit: "mL",
    });
    sqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalServiceUrl === undefined) delete process.env.DIONYSUS_SERVICE_URL;
    else process.env.DIONYSUS_SERVICE_URL = originalServiceUrl;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  function sodaQuantity(): number {
    const sqlite = new Database(dbPath);
    const row = sqlite.prepare("SELECT quantityCanonical FROM pantry_item WHERE id = ?").get(sodaRowId) as {
      quantityCanonical: number;
    };
    sqlite.close();
    return row.quantityCanonical;
  }

  function lineIds(): number[] {
    const sqlite = new Database(dbPath);
    const rows = sqlite.prepare("SELECT id FROM recipe_line WHERE recipeId = ? ORDER BY id").all(recipeId) as Array<{
      id: number;
    }>;
    sqlite.close();
    return rows.map((row) => row.id);
  }

  it("cooks 1 portion with the flour ignored: batch created, soda consumed via package bridge", async () => {
    const { cookRecipe } = await import("@/app/actions/cook-actions");
    const [sodaLine, flourLine] = lineIds();

    const result = await cookRecipe({
      recipeId,
      portions: 1,
      lines: [
        { lineId: sodaLine, action: "consume" },
        { lineId: flourLine, action: "ignore" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 1 can at factor 0.5 = 0.5 can = 177.5 mL consumed from the 400 mL row.
    expect(sodaQuantity()).toBeCloseTo(222.5, 10);
    expect(result.data.ignored).toEqual(["Cook Test Flour"]);
    expect(serviceMock.batches).toHaveLength(1);
    expect(serviceMock.batches[0]).toMatchObject({ servingsMade: 1 });
    // Mirror: soda per-1-mL nutrition, canonical line; flour mirrored too (authored recipe).
    const mirroredRecipe = serviceMock.recipes[0];
    expect(mirroredRecipe).toMatchObject({ name: "Cook Test Recipe", servings: 2 });
    const mirrorLines = mirroredRecipe.lines as Array<{ quantity: number; unit: string }>;
    expect(mirrorLines).toEqual([
      expect.objectContaining({ quantity: 355, unit: "mL" }),
      expect.objectContaining({ quantity: 100, unit: "g" }),
    ]);
    const soda = serviceMock.ingredients.find((item) => item.name === "Cook Test Soda")!;
    expect(soda).toMatchObject({ caloriesKcal: 0.42, sodiumMg: 0, directlyLoggable: false });
    // openspec: meal-micronutrients — mirrored ÷100 (VOLUME reference).
    expect((soda.micronutrients as Record<string, number>).vitaminC).toBeCloseTo(0.169014, 10);
  });

  it("a second cook reuses the mirrors — only a new batch is created", async () => {
    const { cookRecipe } = await import("@/app/actions/cook-actions");
    const [sodaLine, flourLine] = lineIds();
    const choices = {
      recipeId,
      portions: 1,
      lines: [
        { lineId: sodaLine, action: "consume" as const },
        { lineId: flourLine, action: "ignore" as const },
      ],
    };

    expect((await cookRecipe(choices)).ok).toBe(true);
    expect((await cookRecipe(choices)).ok).toBe(true);

    expect(serviceMock.recipes).toHaveLength(1);
    expect(serviceMock.ingredients).toHaveLength(2);
    expect(serviceMock.batches).toHaveLength(2);
  });

  it("substituting consumes the substitute row instead", async () => {
    const sqlite = new Database(dbPath);
    const riceId = insertRawIngredient(sqlite, { name: "Cook Test Rice", unitClass: "MASS" });
    const riceRowId = insertRawPantryItem(sqlite, riceId, {
      quantityCanonical: 500,
      entryUnitClass: "MASS",
      displayQuantity: 500,
      displayUnit: "g",
    });
    sqlite.close();

    const { cookRecipe } = await import("@/app/actions/cook-actions");
    const [sodaLine, flourLine] = lineIds();
    const result = await cookRecipe({
      recipeId,
      portions: 2,
      lines: [
        { lineId: sodaLine, action: "consume" },
        { lineId: flourLine, action: "substitute", substitutePantryItemId: riceRowId, substituteQuantity: 120, substituteUnit: "g" },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.substituted).toEqual([{ name: "Cook Test Flour", substituteName: "Cook Test Rice" }]);
    const checkSqlite = new Database(dbPath);
    const rice = checkSqlite.prepare("SELECT quantityCanonical FROM pantry_item WHERE id = ?").get(riceRowId) as {
      quantityCanonical: number;
    };
    checkSqlite.close();
    expect(rice.quantityCanonical).toBe(380);
  });

  it("consume on a missing line is rejected and nothing happens", async () => {
    const { cookRecipe } = await import("@/app/actions/cook-actions");
    const [sodaLine, flourLine] = lineIds();
    const result = await cookRecipe({
      recipeId,
      portions: 1,
      lines: [
        { lineId: sodaLine, action: "consume" },
        { lineId: flourLine, action: "consume" },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(result.error.message).toMatch(/missing/);
    expect(sodaQuantity()).toBe(400);
    expect(serviceMock.batches).toHaveLength(0);
  });

  it("a service failure consumes nothing", async () => {
    serviceMock.failAll = true;
    const { cookRecipe } = await import("@/app/actions/cook-actions");
    const [sodaLine, flourLine] = lineIds();
    const result = await cookRecipe({
      recipeId,
      portions: 1,
      lines: [
        { lineId: sodaLine, action: "consume" },
        { lineId: flourLine, action: "ignore" },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SERVICE_ERROR");
    expect(sodaQuantity()).toBe(400);
  });

  describe("eat-now portions (openspec: eat-now-and-quick-log)", () => {
  function baseChoices(sodaLine: number, flourLine: number) {
    return [
      { lineId: sodaLine, action: "consume" as const },
      { lineId: flourLine, action: "ignore" as const },
    ];
  }

  it("logs a meal against the fresh batch and reports eatenNow", async () => {
    const { cookRecipe } = await import("@/app/actions/cook-actions");
    const [sodaLine, flourLine] = lineIds();
    const result = await cookRecipe({ recipeId, portions: 4, eatNowPortions: 1, lines: baseChoices(sodaLine, flourLine) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.eatenNow).toBe(1);
    expect(result.data.warnings).toEqual([]);
    expect(serviceMock.meals).toHaveLength(1);
    expect(serviceMock.meals[0].lines).toEqual([
      { lineType: "batch_portion", batchId: serviceMock.batches[0].id, portions: 1 },
    ]);
  });

  it("eat-now 0 (and omitted) logs no meal — identical to the pre-change cook", async () => {
    const { cookRecipe } = await import("@/app/actions/cook-actions");
    const [sodaLine, flourLine] = lineIds();
    expect((await cookRecipe({ recipeId, portions: 1, eatNowPortions: 0, lines: baseChoices(sodaLine, flourLine) })).ok).toBe(true);
    expect((await cookRecipe({ recipeId, portions: 1, lines: baseChoices(sodaLine, flourLine) })).ok).toBe(true);
    expect(serviceMock.meals).toHaveLength(0);
  });

  it("eat-now above the cooked count is rejected and writes nothing", async () => {
    const { cookRecipe } = await import("@/app/actions/cook-actions");
    const [sodaLine, flourLine] = lineIds();
    const result = await cookRecipe({ recipeId, portions: 4, eatNowPortions: 5, lines: baseChoices(sodaLine, flourLine) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fieldErrors?.eatNowPortions).toBeDefined();
    expect(serviceMock.batches).toHaveLength(0);
    expect(sodaQuantity()).toBe(400);
  });

  it("a meal-endpoint failure is a warning on an otherwise successful cook (pantry consumed)", async () => {
    serviceMock.failMeals = true;
    const { cookRecipe } = await import("@/app/actions/cook-actions");
    const [sodaLine, flourLine] = lineIds();
    const result = await cookRecipe({ recipeId, portions: 4, eatNowPortions: 2, lines: baseChoices(sodaLine, flourLine) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.eatenNow).toBe(0);
    expect(result.data.warnings[0]).toMatch(/log it from Meals/i);
    expect(serviceMock.batches).toHaveLength(1);
    expect(sodaQuantity()).toBeLessThan(400);
  });
});

});
