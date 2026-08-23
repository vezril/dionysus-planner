import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient, insertRawPantryItem, insertRawRecipe, insertRawRecipeLine } from "./support/rawFixtures";

/** openspec: backup-export — the backup routes against a real DB, with
 * the service mocked (rollups best-effort). */
const serviceMock = { fail: false };
vi.mock("@/services/dionysusService", () => ({
  DionysusServiceError: class DionysusServiceError extends Error {},
  getLogRange: vi.fn(async () => {
    if (serviceMock.fail) throw new Error("down");
    return { days: [{ date: "2026-08-20", totalNutrition: { caloriesKcal: 500 }, mealCount: 2 }] };
  }),
}));

describe("backup API", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalServiceUrl = process.env.DIONYSUS_SERVICE_URL;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-backup-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.DIONYSUS_SERVICE_URL = "http://service.test";
    vi.resetModules();
    serviceMock.fail = false;

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    const salmonId = insertRawIngredient(sqlite, {
      name: "Backup Salmon",
      unitClass: "MASS",
      caloriesPerRef: 208,
      readyToEat: true,
    });
    sqlite.prepare("INSERT INTO ingredient_tag (ingredientId, tag) VALUES (?, ?)").run(salmonId, "fish");
    sqlite
      .prepare("INSERT INTO ingredient_link (ingredientId, url) VALUES (?, ?)")
      .run(salmonId, "https://store.example/salmon");
    const recipeId = insertRawRecipe(sqlite, { name: "Backup Sear", servings: 2 });
    insertRawRecipeLine(sqlite, recipeId, salmonId, {
      quantityCanonical: 300,
      entryUnitClass: "MASS",
      displayQuantity: 300,
      displayUnit: "g",
    });
    sqlite.prepare("UPDATE recipe SET rating = 5 WHERE id = ?").run(recipeId);
    insertRawPantryItem(sqlite, salmonId, {
      quantityCanonical: 300,
      entryUnitClass: "MASS",
      displayQuantity: 300,
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

  it("the JSON bundle carries recipes, products, pantry, and rollups", async () => {
    const { GET } = await import("@/app/api/backup/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const bundle = (await response.json()) as Record<string, unknown>;
    const recipes = bundle.recipes as Array<Record<string, unknown>>;
    expect(recipes[0]).toMatchObject({ name: "Backup Sear", rating: 5, derivedTags: ["fish"] });
    const products = bundle.products as Array<Record<string, unknown>>;
    const salmon = products.find((product) => product.name === "Backup Salmon")!;
    expect(salmon).toMatchObject({
      readyToEat: true,
      categories: ["fish"],
      merchantLinks: ["https://store.example/salmon"],
    });
    expect((bundle.pantry as unknown[]).length).toBeGreaterThan(0);
    expect((bundle.mealLogDays as unknown[]).length).toBe(1);
  });

  it("a downed service degrades rollups to null, everything else intact", async () => {
    serviceMock.fail = true;
    const { GET } = await import("@/app/api/backup/route");
    const bundle = (await (await GET()).json()) as Record<string, unknown>;
    expect(bundle.mealLogDays).toBeNull();
    expect((bundle.recipes as unknown[]).length).toBe(1);
  });

  it("the markdown route renders a note per recipe and product", async () => {
    const { GET } = await import("@/app/api/backup/markdown/route");
    const payload = (await (await GET()).json()) as { files: Array<{ path: string; content: string }> };
    const paths = payload.files.map((file) => file.path);
    expect(paths).toContain("Recipes/Backup Sear.md");
    expect(paths).toContain("Products/Backup Salmon.md");
    expect(paths).toContain("Pantry.md");
    const recipe = payload.files.find((file) => file.path === "Recipes/Backup Sear.md")!;
    expect(recipe.content).toContain("- 300 g, Backup Salmon");
  });
});
