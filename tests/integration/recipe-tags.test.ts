import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { countRows, getRawRecipeTags, insertRawIngredient, insertRawRecipe, insertRawRecipeLine, insertRawRecipeTag } from "./support/rawFixtures";

/**
 * S-405 recipe tags & tag filtering — persistence + surfacing.
 * Traces to docs/stories/S-405-recipe-tags.md's integration TEST task,
 * prd.md FR-16, architecture.md §4 RecipeTag (free-text, composite PK,
 * `recipe_tag.recipeId` `ON DELETE CASCADE`).
 *
 * `createRecipe`/`updateRecipe` (`app/actions/recipe-actions.ts`) do not
 * yet accept a `tags` field, `recipeSchema` (`domain/validation/recipe
 * .schema.ts`) does not yet have a `tags` key, and neither `getRecipeDetail`
 * nor `listRecipeSummaries` (`data/recipes.ts`) surface tags — every test
 * below is intentionally RED until the implementer builds the full
 * replace-set write path plus the two read paths.
 *
 * Same harness as tests/integration/recipe-actions.test.ts /
 * recipe-edit-delete.test.ts: a real migrated file-backed SQLite DB per
 * test (via `DB_PATH`), `next/cache`'s `revalidatePath` mocked (inert
 * outside a live Next.js request context).
 *
 * ============================ PINNED CONTRACT ============================
 * `domain/validation/recipe.schema.ts#recipeSchema` gains an optional field:
 *   tags?: string[]   // each entry trimmed; an entry that is empty/
 *                      // whitespace-only AFTER trimming is a validation
 *                      // failure (`fieldErrors.tags`) — same "reject, don't
 *                      // silently drop" posture the schema already takes
 *                      // for a 0-length `lines` array. Trimmed tags are
 *                      // then deduplicated by EXACT (case-sensitive)
 *                      // string equality — tags are free text and are
 *                      // NEVER lowercase-folded (Dev Notes: "do not
 *                      // lowercase-fold silently; store as typed"), so
 *                      // "Quick" and "quick" are two distinct tags, not a
 *                      // duplicate pair.
 *
 * `createRecipe(input)` / `updateRecipe(id, input)`:
 *   - `input.tags` omitted entirely => the recipe is saved/updated with
 *     ZERO tags (an update that omits `tags` REPLACES any previously-saved
 *     tags with none — full replace-set semantics, same as `lines`, per
 *     the story's IMPL task: "replace-set tags transactionally").
 *   - On success, `result.data.tags: string[]` is present alongside
 *     `result.data.lines`, containing exactly the deduplicated, trimmed
 *     tags that were saved (order not asserted below; compared sorted).
 *   - A validation failure (including an empty-string tag entry) writes
 *     NOTHING — no `recipe` row, no `recipe_line` rows, no `recipe_tag`
 *     rows — mirroring the existing 0-lines-blocks-everything invariant.
 *   - Tags persist to the `recipe_tag` table: one row per DISTINCT
 *     (post-trim, case-sensitive) tag, `recipeId` referencing the saved
 *     recipe.
 *   - A tag entered twice (exact duplicate, post-trim) in the same payload
 *     saves ONCE, with `result.ok === true` — no PK-violation error ever
 *     surfaces to the caller (AC3).
 *
 * `data/recipes.ts`:
 *   - `getRecipeDetail(id)`'s resolved value gains a sibling field:
 *     `tags: string[]` (alongside the existing `recipe`/`lines`/
 *     `nutrition` fields) — the recipe's current tags, exactly matching
 *     what was last saved via create/update.
 *   - `listRecipeSummaries()`'s each `RecipeSummary` gains a `tags: string[]`
 *     field — that recipe's own tags (AC1: tags "display on the recipe's
 *     detail AND list entries").
 *
 * `deleteRecipe(id)`: deleting a recipe with tags removes its `recipe_tag`
 * rows too (DB-level `ON DELETE CASCADE`, already schema/constraint-tested
 * at the SQL level — this suite pins that the ACTION layer's delete path
 * doesn't leave orphaned tag rows behind it).
 * ===========================================================================
 */
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

function openRawDb(dbPath: string): Database.Database {
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

describe("S-405 recipe tags — createRecipe / updateRecipe / deleteRecipe / read paths", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalNextRuntime = process.env.NEXT_RUNTIME;

  let chickenId: number;
  let riceId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-recipe-tags-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.NEXT_RUNTIME = "nodejs";
    vi.resetModules();

    const setupSqlite = openRawDb(dbPath);
    runMigrations(setupSqlite);

    chickenId = insertRawIngredient(setupSqlite, {
      name: "Chicken Breast",
      unitClass: "MASS",
      caloriesPerRef: 165,
      proteinPerRef: 31,
      carbsPerRef: 0,
      fatPerRef: 3.6,
    });
    riceId = insertRawIngredient(setupSqlite, {
      name: "Rice",
      unitClass: "MASS",
      densityGPerMl: 0.85,
      caloriesPerRef: 130,
      proteinPerRef: 2.7,
      carbsPerRef: 28,
      fatPerRef: 0.3,
    });

    setupSqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalNextRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = originalNextRuntime;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  const baseInput = (overrides: Record<string, unknown> = {}) => ({
    name: "Chicken and Rice",
    servings: 4,
    instructions: "Cook it.",
    lines: [{ ingredientId: chickenId, quantity: 400, unit: "g" }],
    ...overrides,
  });

  describe("createRecipe with tags", () => {
    it("returns ok:true with result.data.tags containing the saved tags (sorted comparison)", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe(baseInput({ tags: ["quick", "vegetarian"] }));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect([...result.data.tags].sort()).toEqual(["quick", "vegetarian"]);
    });

    it("persists one recipe_tag row per tag, referencing the saved recipe", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe(baseInput({ tags: ["quick", "vegetarian"] }));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const raw = openRawDb(dbPath);
      const tags = getRawRecipeTags(raw, result.data.id);
      raw.close();
      expect(tags).toEqual(["quick", "vegetarian"]);
    });

    it("trims whitespace around each tag before storing (no leading/trailing whitespace in the DB)", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe(baseInput({ tags: ["  quick  ", "vegetarian"] }));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const raw = openRawDb(dbPath);
      const tags = getRawRecipeTags(raw, result.data.id);
      raw.close();
      expect(tags).toEqual(["quick", "vegetarian"]);
    });

    it("does NOT lowercase-fold tags — differently-cased entries are stored as two distinct tags", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe(baseInput({ tags: ["Quick", "quick"] }));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const raw = openRawDb(dbPath);
      const tags = getRawRecipeTags(raw, result.data.id);
      raw.close();
      expect(tags).toEqual(["Quick", "quick"]);
    });

    it("a tag entered twice (exact duplicate) saves ONCE with no error (AC3, composite PK)", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe(baseInput({ tags: ["quick", "quick"] }));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.tags).toEqual(["quick"]);
      const raw = openRawDb(dbPath);
      expect(countRows(raw, "recipe_tag")).toBe(1);
      raw.close();
    });

    it("an empty-string tag entry is rejected as a validation failure, writing nothing at all", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe(baseInput({ tags: ["quick", "   "] }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.fieldErrors?.tags).toBeDefined();
      const raw = openRawDb(dbPath);
      expect(countRows(raw, "recipe")).toBe(0);
      expect(countRows(raw, "recipe_line")).toBe(0);
      expect(countRows(raw, "recipe_tag")).toBe(0);
      raw.close();
    });

    it("omitting tags entirely saves the recipe with zero tags, and result.data.tags is [] (never undefined)", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe(baseInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.tags).toEqual([]);
      const raw = openRawDb(dbPath);
      expect(countRows(raw, "recipe_tag")).toBe(0);
      raw.close();
    });
  });

  describe("updateRecipe with tags — full replace-set semantics", () => {
    function seedRecipeWithTags(tags: string[]): number {
      const sqlite = openRawDb(dbPath);
      const recipeId = insertRawRecipe(sqlite, { name: "Chicken and Rice", servings: 4, instructions: "Cook it." });
      insertRawRecipeLine(sqlite, recipeId, chickenId, {
        quantityCanonical: 400,
        entryUnitClass: "MASS",
        displayQuantity: 400,
        displayUnit: "g",
      });
      for (const tag of tags) insertRawRecipeTag(sqlite, recipeId, tag);
      sqlite.close();
      return recipeId;
    }

    it("replaces the previous tag set entirely — old tags gone, new tags present", async () => {
      const recipeId = seedRecipeWithTags(["quick", "vegetarian"]);
      const { updateRecipe } = await import("@/app/actions/recipe-actions");

      const result = await updateRecipe(recipeId, baseInput({ tags: ["one-pot"] }));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.tags).toEqual(["one-pot"]);
      const raw = openRawDb(dbPath);
      expect(getRawRecipeTags(raw, recipeId)).toEqual(["one-pot"]);
      raw.close();
    });

    it("omitting tags on update CLEARS any previously-saved tags (replace-set with an empty set)", async () => {
      const recipeId = seedRecipeWithTags(["quick", "vegetarian"]);
      const { updateRecipe } = await import("@/app/actions/recipe-actions");

      const result = await updateRecipe(recipeId, baseInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.tags).toEqual([]);
      const raw = openRawDb(dbPath);
      expect(getRawRecipeTags(raw, recipeId)).toEqual([]);
      raw.close();
    });

    it("a validation failure on update leaves the previously-saved tags completely untouched", async () => {
      const recipeId = seedRecipeWithTags(["quick", "vegetarian"]);
      const { updateRecipe } = await import("@/app/actions/recipe-actions");

      const result = await updateRecipe(recipeId, baseInput({ lines: [], tags: ["one-pot"] }));

      expect(result.ok).toBe(false);
      const raw = openRawDb(dbPath);
      expect(getRawRecipeTags(raw, recipeId)).toEqual(["quick", "vegetarian"]);
      raw.close();
    });
  });

  describe("deleteRecipe cascades its tags", () => {
    it("removes the recipe_tag rows for the deleted recipe (no orphaned tag rows)", async () => {
      const sqlite = openRawDb(dbPath);
      const recipeId = insertRawRecipe(sqlite, { name: "Chicken and Rice", servings: 4 });
      insertRawRecipeLine(sqlite, recipeId, chickenId, {
        quantityCanonical: 400,
        entryUnitClass: "MASS",
        displayQuantity: 400,
        displayUnit: "g",
      });
      insertRawRecipeTag(sqlite, recipeId, "quick");
      insertRawRecipeTag(sqlite, recipeId, "vegetarian");
      sqlite.close();

      const { deleteRecipe } = await import("@/app/actions/recipe-actions");
      const result = await deleteRecipe(recipeId);

      expect(result.ok).toBe(true);
      const raw = openRawDb(dbPath);
      expect(countRows(raw, "recipe_tag")).toBe(0);
      raw.close();
    });
  });

  describe("tags surface on read paths (AC1: detail AND list entries)", () => {
    it("getRecipeDetail(id).tags reflects the recipe's saved tags", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");
      const { getRecipeDetail } = await import("@/data/recipes");

      const created = await createRecipe(baseInput({ tags: ["quick", "vegetarian"] }));
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const detail = await getRecipeDetail(created.data.id);

      expect(detail).not.toBeNull();
      expect([...detail!.tags].sort()).toEqual(["quick", "vegetarian"]);
    });

    it("getRecipeDetail(id).tags is [] for a recipe with no tags (never undefined)", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");
      const { getRecipeDetail } = await import("@/data/recipes");

      const created = await createRecipe(baseInput());
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const detail = await getRecipeDetail(created.data.id);

      expect(detail!.tags).toEqual([]);
    });

    it("listRecipeSummaries() surfaces each recipe's own tags, without mixing tags across recipes", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");
      const { listRecipeSummaries } = await import("@/data/recipes");

      const quickOnly = await createRecipe(
        baseInput({ name: "Quick Rice Bowl", lines: [{ ingredientId: riceId, quantity: 200, unit: "g" }], tags: ["quick"] }),
      );
      const vegetarianOnly = await createRecipe(
        baseInput({
          name: "Vegetarian Rice Bowl",
          lines: [{ ingredientId: riceId, quantity: 200, unit: "g" }],
          tags: ["vegetarian"],
        }),
      );
      expect(quickOnly.ok).toBe(true);
      expect(vegetarianOnly.ok).toBe(true);
      if (!quickOnly.ok || !vegetarianOnly.ok) return;

      const summaries = await listRecipeSummaries();

      const quickSummary = summaries.find((summary: { id: number }) => summary.id === quickOnly.data.id)!;
      const vegetarianSummary = summaries.find((summary: { id: number }) => summary.id === vegetarianOnly.data.id)!;

      expect(quickSummary.tags).toEqual(["quick"]);
      expect(vegetarianSummary.tags).toEqual(["vegetarian"]);
    });
  });
});
