import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient, insertRawRecipe, insertRawRecipeLine } from "./support/rawFixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** openspec: ratings-variants-links — ratings, linked variations, and
 * merchant links against a real migrated DB. */
describe("ratings, variations, merchant links", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  let flourId: number;
  let recipeId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-rvl-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    flourId = insertRawIngredient(sqlite, { name: "RVL Flour", unitClass: "MASS", caloriesPerRef: 364 });
    recipeId = insertRawRecipe(sqlite, { name: "RVL Bread", servings: 4 });
    insertRawRecipeLine(sqlite, recipeId, flourId, {
      quantityCanonical: 500,
      entryUnitClass: "MASS",
      displayQuantity: 500,
      displayUnit: "g",
    });
    sqlite.prepare("INSERT INTO recipe_tag (recipeId, tag) VALUES (?, ?)").run(recipeId, "bread");
    sqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ratings set, clear, and reject out-of-range values", async () => {
    const { rateRecipe } = await import("@/app/actions/recipe-actions");
    const { getRecipeDetail } = await import("@/data/recipes");

    expect((await rateRecipe(recipeId, 6)).ok).toBe(false);
    expect((await rateRecipe(recipeId, 0)).ok).toBe(false);
    expect((await rateRecipe(recipeId, 2.5)).ok).toBe(false);

    expect((await rateRecipe(recipeId, 4)).ok).toBe(true);
    expect((await getRecipeDetail(recipeId))!.recipe.rating).toBe(4);
    expect((await rateRecipe(recipeId, null)).ok).toBe(true);
    expect((await getRecipeDetail(recipeId))!.recipe.rating).toBeNull();
  });

  it("a variation copies lines and tags and links to its root — even a variation of a variation", async () => {
    const { createRecipeVariationRecord, getRecipeDetail } = await import("@/data/recipes");

    const firstId = (await createRecipeVariationRecord(recipeId))!;
    const first = (await getRecipeDetail(firstId))!;
    expect(first.recipe.name).toBe("RVL Bread (variation)");
    expect(first.recipe.variantOfId).toBe(recipeId);
    expect(first.lines).toHaveLength(1);
    expect(first.lines[0]).toMatchObject({ ingredientId: flourId, displayQuantity: 500 });
    expect(first.tags).toEqual(["bread"]);
    expect(first.variantOf).toEqual({ id: recipeId, name: "RVL Bread" });

    // Variation of the variation still links to the ROOT.
    const secondId = (await createRecipeVariationRecord(firstId))!;
    expect((await getRecipeDetail(secondId))!.recipe.variantOfId).toBe(recipeId);

    const root = (await getRecipeDetail(recipeId))!;
    expect(root.variations.map((variation) => variation.id).sort()).toEqual([firstId, secondId].sort());
  });

  it("annotated list rows carry rating and the variation note", async () => {
    const { createRecipeVariationRecord, listRecipeSummariesAnnotated, setRecipeRatingRecord } =
      await import("@/data/recipes");
    await setRecipeRatingRecord(recipeId, 5);
    const variantId = (await createRecipeVariationRecord(recipeId))!;

    const rows = await listRecipeSummariesAnnotated(0.9);
    const rootRow = rows.find((row) => row.id === recipeId)!;
    const variantRow = rows.find((row) => row.id === variantId)!;
    expect(rootRow.rating).toBe(5);
    expect(rootRow.variantOfName).toBeNull();
    expect(variantRow.variantOfName).toBe("RVL Bread");
  });

  it("merchant links round-trip with replace-set semantics", async () => {
    const { getIngredientMerchantLinks, setIngredientMerchantLinks } = await import("@/data/ingredients");
    await setIngredientMerchantLinks(flourId, ["https://a.example/flour", "https://b.example/flour"]);
    expect((await getIngredientMerchantLinks(flourId)).sort()).toEqual([
      "https://a.example/flour",
      "https://b.example/flour",
    ]);
    await setIngredientMerchantLinks(flourId, ["https://c.example/flour"]);
    expect(await getIngredientMerchantLinks(flourId)).toEqual(["https://c.example/flour"]);
  });
});
