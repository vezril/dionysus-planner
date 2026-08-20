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
  failAll: false,
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
    serviceMock.failAll = false;

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
});
