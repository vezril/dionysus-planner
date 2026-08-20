import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient, insertRawRecipe, insertRawRecipeLine } from "./support/rawFixtures";

/**
 * openspec: ingredient-categories-auto-tags — custom categories on
 * products/generics and the recipe tags derived from them at read time
 * (line ingredient ∪ generic root, merged with manual tags, never
 * persisted to recipe_tag).
 */
describe("ingredient categories and derived recipe tags", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  let genericSalmonId: number;
  let productSalmonId: number;
  let recipeId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-cat-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    genericSalmonId = insertRawIngredient(sqlite, { name: "Salmon", unitClass: "MASS", caloriesPerRef: 208 });
    productSalmonId = insertRawIngredient(sqlite, {
      name: "Salmon, atlantic (Brandy)",
      unitClass: "MASS",
      caloriesPerRef: 210,
      genericOfId: genericSalmonId,
    });
    recipeId = insertRawRecipe(sqlite, { name: "Seared Salmon", servings: 2 });
    insertRawRecipeLine(sqlite, recipeId, productSalmonId, {
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
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("categories round-trip with replace-set semantics", async () => {
    const { getIngredientCategories, setIngredientCategories } = await import("@/data/ingredients");
    await setIngredientCategories(genericSalmonId, ["fish", "seafood"]);
    expect((await getIngredientCategories(genericSalmonId)).sort()).toEqual(["fish", "seafood"]);
    await setIngredientCategories(genericSalmonId, ["fish"]);
    expect(await getIngredientCategories(genericSalmonId)).toEqual(["fish"]);
    await setIngredientCategories(genericSalmonId, []);
    expect(await getIngredientCategories(genericSalmonId)).toEqual([]);
  });

  it("recipes derive tags from the line product AND its generic root, merged with manual", async () => {
    const { setIngredientCategories } = await import("@/data/ingredients");
    const { listRecipeSummaries } = await import("@/data/recipes");
    await setIngredientCategories(genericSalmonId, ["fish"]);
    await setIngredientCategories(productSalmonId, ["salmon"]);

    // A manual tag that also collides with a derived one dedupes exactly.
    const sqlite = new Database(dbPath);
    const insertTag = sqlite.prepare("INSERT INTO recipe_tag (recipeId, tag) VALUES (?, ?)");
    insertTag.run(recipeId, "dinner");
    insertTag.run(recipeId, "fish");
    sqlite.close();

    const summaries = await listRecipeSummaries();
    const row = summaries.find((summary) => summary.id === recipeId)!;
    expect([...row.tags].sort()).toEqual(["dinner", "fish", "salmon"]);
  });

  it("detail separates derived from manual and persists nothing to recipe_tag", async () => {
    const { setIngredientCategories } = await import("@/data/ingredients");
    const { getRecipeDetail } = await import("@/data/recipes");
    await setIngredientCategories(genericSalmonId, ["fish"]);
    await setIngredientCategories(productSalmonId, ["salmon"]);
    const seed = new Database(dbPath);
    seed.prepare("INSERT INTO recipe_tag (recipeId, tag) VALUES (?, ?)").run(recipeId, "fish");
    seed.close();

    const detail = (await getRecipeDetail(recipeId))!;
    expect(detail.tags).toEqual(["fish"]);
    expect([...detail.derivedTags].sort()).toEqual(["salmon"]);

    const sqlite = new Database(dbPath);
    const stored = sqlite.prepare("SELECT tag FROM recipe_tag WHERE recipeId = ?").all(recipeId) as Array<{
      tag: string;
    }>;
    sqlite.close();
    expect(stored.map((row) => row.tag)).toEqual(["fish"]);
  });

  it("an untagged recipe derives nothing", async () => {
    const { getRecipeDetail } = await import("@/data/recipes");
    const detail = (await getRecipeDetail(recipeId))!;
    expect(detail.derivedTags).toEqual([]);
    const { listRecipeSummaries } = await import("@/data/recipes");
    const row = (await listRecipeSummaries()).find((summary) => summary.id === recipeId)!;
    expect(row.tags).toEqual([]);
  });
});
