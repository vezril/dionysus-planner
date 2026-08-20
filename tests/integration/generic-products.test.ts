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

const serviceMock = { batches: [] as unknown[], recipes: [] as unknown[], meals: [] as unknown[], nextId: 100 };
vi.mock("@/services/dionysusService", () => ({
  DionysusServiceError: class DionysusServiceError extends Error {},
  listIngredients: vi.fn(async () => []),
  createIngredient: vi.fn(async (_b: string, input: object) => ({ ...input, id: serviceMock.nextId++ })),
  listRecipes: vi.fn(async () => serviceMock.recipes),
  createRecipe: vi.fn(async (_b: string, input: object) => {
    const created = { ...input, id: serviceMock.nextId++ };
    serviceMock.recipes.push(created);
    return created;
  }),
  createBatch: vi.fn(async (_b: string, input: { servingsMade: number }) => ({ ...input, id: serviceMock.nextId++, remainingPortions: input.servingsMade })),
  createMeal: vi.fn(async (_b: string, input: object) => ({ ...input, id: serviceMock.nextId++ })),
  listBatches: vi.fn(async () => serviceMock.batches),
}));

/**
 * openspec: generic-products — validation, interchangeable availability,
 * and the cook-time product choice.
 */
describe("generic products", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalServiceUrl = process.env.DIONYSUS_SERVICE_URL;

  let butterId: number;
  let lactantiaId: number;
  let kirklandId: number;
  let recipeId: number;
  let lactantiaRowId: number;
  let kirklandRowId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-generic-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.DIONYSUS_SERVICE_URL = "http://service.test";
    vi.resetModules();
    serviceMock.recipes = [];
    serviceMock.batches = [];

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    butterId = insertRawIngredient(sqlite, { name: "Butter", unitClass: "MASS", caloriesPerRef: 717 });
    lactantiaId = insertRawIngredient(sqlite, { name: "Lactantia Butter", unitClass: "MASS", genericOfId: butterId });
    kirklandId = insertRawIngredient(sqlite, { name: "Kirkland Butter", unitClass: "MASS", genericOfId: butterId });
    // Recipe: 200 g of GENERIC butter, 1 serving.
    recipeId = insertRawRecipe(sqlite, { name: "Butter Cookies", servings: 1 });
    insertRawRecipeLine(sqlite, recipeId, butterId, {
      quantityCanonical: 200,
      entryUnitClass: "MASS",
      displayQuantity: 200,
      displayUnit: "g",
    });
    // Two branded rows, 150 g each — neither alone covers 200 g.
    lactantiaRowId = insertRawPantryItem(sqlite, lactantiaId, {
      quantityCanonical: 150,
      entryUnitClass: "MASS",
      displayQuantity: 150,
      displayUnit: "g",
    });
    kirklandRowId = insertRawPantryItem(sqlite, kirklandId, {
      quantityCanonical: 150,
      entryUnitClass: "MASS",
      displayQuantity: 150,
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

  it("linking to a product or a different class is rejected; a valid link persists", async () => {
    const { createIngredient } = await import("@/app/actions/ingredient-actions");
    const base = { name: "Test Product", unitClass: "MASS", caloriesPerRef: 1, proteinPerRef: 0, carbsPerRef: 0, fatPerRef: 0 };

    const toProduct = await createIngredient({ ...base, genericOfId: lactantiaId });
    expect(toProduct.ok).toBe(false);

    const wrongClass = await createIngredient({ ...base, unitClass: "VOLUME", genericOfId: butterId });
    expect(wrongClass.ok).toBe(false);

    const valid = await createIngredient({ ...base, genericOfId: butterId });
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.data.genericOfId).toBe(butterId);
  });

  it("deleting a generic with linked products is refused by name", async () => {
    const { deleteIngredient } = await import("@/app/actions/ingredient-actions");
    const result = await deleteIngredient(butterId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/Lactantia Butter/);
  });

  it("interchangeable stock makes the generic-line recipe cookable (WCIC)", async () => {
    const { getWhatCanICook } = await import("@/data/whatCanICook");
    const result = await getWhatCanICook(3);
    expect(result.cookable.map((recipe) => recipe.name)).toContain("Butter Cookies");
  });

  it("previewCook demands a choice between the two butters", async () => {
    const { previewCook } = await import("@/app/actions/cook-actions");
    const preview = await previewCook(recipeId, 1);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const line = preview.data.lines[0];
    expect(line.status).toBe("choice");
    expect(line.candidates.map((candidate) => candidate.name).sort()).toEqual(["Kirkland Butter", "Lactantia Butter"]);
  });

  it("cook without a pick is rejected; the chosen product's row is consumed", async () => {
    const { cookRecipe, previewCook } = await import("@/app/actions/cook-actions");
    const preview = await previewCook(recipeId, 1);
    const lineId = preview.ok ? preview.data.lines[0].lineId : -1;

    const unpicked = await cookRecipe({ recipeId, portions: 1, eatNowPortions: 0, lines: [{ lineId, action: "consume" }] });
    expect(unpicked.ok).toBe(false);
    if (!unpicked.ok) expect(unpicked.error.message).toMatch(/pick which one/i);

    const picked = await cookRecipe({
      recipeId,
      portions: 1,
      eatNowPortions: 0,
      lines: [{ lineId, action: "consume", usePantryItemId: lactantiaRowId }],
    });
    expect(picked.ok).toBe(true);

    const sqlite = new Database(dbPath);
    const lactantia = sqlite.prepare("SELECT quantityCanonical FROM pantry_item WHERE id = ?").get(lactantiaRowId) as { quantityCanonical: number };
    const kirkland = sqlite.prepare("SELECT quantityCanonical FROM pantry_item WHERE id = ?").get(kirklandRowId) as { quantityCanonical: number };
    sqlite.close();
    // 200 g needed against 150 g chosen: floors at zero (documented one-row rule).
    expect(lactantia.quantityCanonical).toBe(0);
    expect(kirkland.quantityCanonical).toBe(150);
  });
});
