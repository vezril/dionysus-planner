import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient, insertRawRecipe, insertRawRecipeLine } from "./support/rawFixtures";

/** openspec: subrecipe-ready — [[sub-recipe]] availability from cooked
 * batches (service mirror matched by name; empty on failure). */
const serviceMock = {
  batches: [] as Array<{ id: number; recipeId: number; cookedAt: string; servingsMade: number; remainingPortions: number }>,
  recipes: [] as Array<{ id: number; name: string }>,
  fail: false,
};
vi.mock("@/services/dionysusService", () => ({
  DionysusServiceError: class DionysusServiceError extends Error {},
  listBatches: vi.fn(async () => {
    if (serviceMock.fail) throw new Error("down");
    return serviceMock.batches;
  }),
  listRecipes: vi.fn(async () => {
    if (serviceMock.fail) throw new Error("down");
    return serviceMock.recipes;
  }),
}));

describe("sub-recipe ready availability", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalServiceUrl = process.env.DIONYSUS_SERVICE_URL;

  let spiceId: number;
  let mixId: number;
  let parentId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-subready-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.DIONYSUS_SERVICE_URL = "http://service.test";
    vi.resetModules();
    serviceMock.fail = false;
    serviceMock.recipes = [{ id: 1, name: "Cajun Spice Mix" }];
    serviceMock.batches = [
      { id: 7, recipeId: 1, cookedAt: "2026-08-24T12:00:00Z", servingsMade: 4, remainingPortions: 1.5 },
      { id: 8, recipeId: 1, cookedAt: "2026-08-25T12:00:00Z", servingsMade: 4, remainingPortions: 0.5 },
    ];

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    spiceId = insertRawIngredient(sqlite, { name: "SR Paprika", unitClass: "MASS", caloriesPerRef: 280 });
    mixId = insertRawRecipe(sqlite, { name: "Cajun Spice Mix", servings: 4 });
    insertRawRecipeLine(sqlite, mixId, spiceId, {
      quantityCanonical: 20,
      entryUnitClass: "MASS",
      displayQuantity: 20,
      displayUnit: "g",
    });
    parentId = insertRawRecipe(sqlite, {
      name: "Cajun Chicken",
      servings: 2,
      instructions: `Season with @SR Paprika(${spiceId}){5%g}, then use [[Cajun Spice Mix(${mixId})]].`,
    });
    insertRawRecipeLine(sqlite, parentId, spiceId, {
      quantityCanonical: 5,
      entryUnitClass: "MASS",
      displayQuantity: 5,
      displayUnit: "g",
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

  it("sums remaining portions across the sub-recipe's batches", async () => {
    const { getRecipeDetail } = await import("@/data/recipes");
    const detail = (await getRecipeDetail(parentId))!;
    expect(detail.subRecipeReady).toEqual({ [mixId]: 2 });
  });

  it("drained batches leave the link plain", async () => {
    serviceMock.batches = serviceMock.batches.map((batch) => ({ ...batch, remainingPortions: 0 }));
    const { getRecipeDetail } = await import("@/data/recipes");
    const detail = (await getRecipeDetail(parentId))!;
    expect(detail.subRecipeReady).toEqual({});
  });

  it("a downed service degrades to no availability info", async () => {
    serviceMock.fail = true;
    const { getRecipeDetail } = await import("@/data/recipes");
    const detail = (await getRecipeDetail(parentId))!;
    expect(detail.subRecipeReady).toEqual({});
  });

  it("recipes without refs never touch the service", async () => {
    serviceMock.fail = true; // would throw if called
    const { getRecipeDetail } = await import("@/data/recipes");
    const detail = (await getRecipeDetail(mixId))!;
    expect(detail.subRecipeReady).toEqual({});
  });
});
