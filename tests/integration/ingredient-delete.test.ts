import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import {
  countRows,
  insertRawIngredient,
  insertRawPantryItem,
  insertRawRecipe,
  insertRawRecipeLine,
} from "./support/rawFixtures";

/**
 * S-303: `deleteIngredient` Server Action — ingredient deletion rules.
 *
 * Traces to docs/stories/S-303-ingredient-delete-rules.md AC-1 through
 * AC-4, prd.md FR-4 ("Users can delete a custom ingredient only if it is
 * not referenced by any pantry item or recipe ingredient line; otherwise
 * deletion is blocked with a message listing the referencing records.
 * Seeded ingredients are never deletable — override-only"), architecture.md
 * §4 (`source` field's deletability note, RecipeLine/PantryItem
 * `ON DELETE RESTRICT`), §6 error-handling strategy ("FK RESTRICT
 * violations are pre-empted by an explicit referencing-records query... the
 * DB constraint remains as backstop, and if it still fires it is caught in
 * the action and mapped to the same error shape").
 *
 * `app/actions/ingredient-actions.ts` currently exports only `createIngredient`
 * and `overrideIngredientNutrition` (S-302) — every test below is
 * intentionally RED (no `deleteIngredient` export) until the implementer
 * builds it.
 *
 * Same harness as tests/integration/ingredient-actions.test.ts: a real
 * migrated file-backed SQLite DB per test (via `DB_PATH`), `next/cache`'s
 * `revalidatePath` mocked (inert outside a live Next.js request context),
 * repository-bypassing raw-SQL fixtures for setting up referencing rows.
 *
 * ============================ PINNED CONTRACT ============================
 * export async function deleteIngredient(id: number): Promise<ActionResult<{ id: number }>>
 *   (`ActionResult`/`ActionError` reused verbatim from S-302's existing
 *   shape in this same file: `{ ok:true, data } | { ok:false, error:{ code,
 *   message, fieldErrors? } }`.)
 *
 *   - `id` does not resolve to any ingredient =>
 *       { ok:false, error:{ code:"NOT_FOUND", message } }. No write, no
 *       revalidate.
 *   - Target row `source === "SEEDED"` => ALWAYS
 *       { ok:false, error:{ code:"SEEDED_NOT_DELETABLE", message } },
 *       regardless of whether it is referenced (seeded ingredients are
 *       never deletable — override-only, per FR-3/FR-4/AC-3). Row
 *       untouched, no revalidate.
 *   - Target row `source === "CUSTOM"` AND referenced by >=1 recipe line
 *     and/or a pantry item (per `ingredientRepo.getReferencesTo`'s shape)
 *     => { ok:false, error:{ code:"REFERENCED", message } }, where
 *     `message` names every referencing recipe by its `name` (FR-4's
 *     friendly listing — never a raw FK error) and mentions "pantry"
 *     whenever `inPantry` is true. Row untouched, no revalidate.
 *   - Target row `source === "CUSTOM"` AND unreferenced => deletes the row
 *     (via `ingredientRepo.remove`), calls `revalidatePath("/ingredients")`,
 *     returns `{ ok:true, data:{ id } }`.
 *   - Race backstop (architecture.md §6, AC-4): if the referencing
 *     pre-check reports no references but the DB's `ON DELETE RESTRICT`
 *     constraint still fires on the delete itself (a reference inserted
 *     concurrently, between the check and the delete), the action catches
 *     the resulting constraint violation and maps it to the SAME
 *     `{ ok:false, error:{ code:"REFERENCED", ... } }` shape — never an
 *     unhandled exception or a raw SQLite error surfacing to the caller.
 *
 *   Delegates to two new `/data/ingredients.ts` entry points, following the
 *   same per-call `createDb()` pattern as the file's existing three
 *   functions (`getIngredientRecordById`, `createIngredientRecord`,
 *   `updateIngredientNutritionRecord`):
 *     - `getIngredientReferences(id): Promise<{ recipes: Array<{ id: number; name: string }>; inPantry: boolean }>`
 *       (wraps `ingredientRepo.getReferencesTo`)
 *     - `removeIngredientRecord(id): Promise<void>` (wraps `ingredientRepo.remove`)
 * ===========================================================================
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function openRawDb(dbPath: string): Database.Database {
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

describe("app/actions/ingredient-actions: deleteIngredient", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-ingredient-delete-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    vi.resetModules();

    const setupSqlite = openRawDb(dbPath);
    runMigrations(setupSqlite);
    setupSqlite.close();
  });

  afterEach(() => {
    vi.doUnmock("@/data/ingredients");
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("unreferenced CUSTOM ingredient (AC-1)", () => {
    it("deletes the row and returns ok:true", async () => {
      const setupSqlite = openRawDb(dbPath);
      const customId = insertRawIngredient(setupSqlite, { name: "Homemade Almond Milk", source: "CUSTOM" });
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");
      const result = await actions.deleteIngredient(customId);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.id).toBe(customId);

      const raw = openRawDb(dbPath);
      const row = raw
        .prepare("SELECT * FROM ingredient WHERE id = ?")
        .get(customId) as Record<string, unknown> | undefined;
      raw.close();
      expect(row).toBeUndefined();
    });

    it("revalidates the ingredient catalog path on successful delete", async () => {
      const setupSqlite = openRawDb(dbPath);
      const customId = insertRawIngredient(setupSqlite, { name: "Homemade Almond Milk", source: "CUSTOM" });
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");
      const { revalidatePath } = await import("next/cache");

      const result = await actions.deleteIngredient(customId);

      expect(result.ok).toBe(true);
      expect(revalidatePath).toHaveBeenCalledWith("/ingredients");
    });
  });

  describe("CUSTOM ingredient referenced by a recipe line (AC-2)", () => {
    it("blocks deletion with error.code REFERENCED, lists the recipe name, and leaves the row in place", async () => {
      const setupSqlite = openRawDb(dbPath);
      const customId = insertRawIngredient(setupSqlite, { name: "Rice", source: "CUSTOM" });
      const recipeId = insertRawRecipe(setupSqlite, { name: "Fried Rice" });
      insertRawRecipeLine(setupSqlite, recipeId, customId);
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");
      const { revalidatePath } = await import("next/cache");

      const result = await actions.deleteIngredient(customId);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("REFERENCED");
      expect(result.error.message).toContain("Fried Rice");
      expect(revalidatePath).not.toHaveBeenCalled();

      const raw = openRawDb(dbPath);
      const row = raw.prepare("SELECT * FROM ingredient WHERE id = ?").get(customId);
      raw.close();
      expect(row).toBeDefined();
    });

    it("lists every referencing recipe by name when more than one recipe references it", async () => {
      const setupSqlite = openRawDb(dbPath);
      const customId = insertRawIngredient(setupSqlite, { name: "Garlic", source: "CUSTOM" });
      const recipeAId = insertRawRecipe(setupSqlite, { name: "Garlic Bread" });
      const recipeBId = insertRawRecipe(setupSqlite, { name: "Garlic Soup" });
      insertRawRecipeLine(setupSqlite, recipeAId, customId);
      insertRawRecipeLine(setupSqlite, recipeBId, customId);
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");

      const result = await actions.deleteIngredient(customId);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("REFERENCED");
      expect(result.error.message).toContain("Garlic Bread");
      expect(result.error.message).toContain("Garlic Soup");
    });
  });

  describe("CUSTOM ingredient referenced by a pantry item (AC-2)", () => {
    it("blocks deletion with error.code REFERENCED, mentions pantry, and leaves the row in place", async () => {
      const setupSqlite = openRawDb(dbPath);
      const customId = insertRawIngredient(setupSqlite, { name: "Flour", source: "CUSTOM" });
      insertRawPantryItem(setupSqlite, customId);
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");

      const result = await actions.deleteIngredient(customId);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("REFERENCED");
      expect(result.error.message).toMatch(/pantry/i);

      const raw = openRawDb(dbPath);
      const row = raw.prepare("SELECT * FROM ingredient WHERE id = ?").get(customId);
      raw.close();
      expect(row).toBeDefined();
    });

    it("mentions both the referencing recipe and pantry presence when both apply", async () => {
      const setupSqlite = openRawDb(dbPath);
      const customId = insertRawIngredient(setupSqlite, { name: "Butter", source: "CUSTOM" });
      const recipeId = insertRawRecipe(setupSqlite, { name: "Butter Cookies" });
      insertRawRecipeLine(setupSqlite, recipeId, customId);
      insertRawPantryItem(setupSqlite, customId);
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");

      const result = await actions.deleteIngredient(customId);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("REFERENCED");
      expect(result.error.message).toContain("Butter Cookies");
      expect(result.error.message).toMatch(/pantry/i);
    });
  });

  describe("SEEDED ingredient (AC-3 — never deletable, override-only)", () => {
    it("rejects deletion of an unreferenced SEEDED ingredient with error.code SEEDED_NOT_DELETABLE", async () => {
      const setupSqlite = openRawDb(dbPath);
      const seededId = insertRawIngredient(setupSqlite, {
        seedKey: "usda:11215",
        name: "Garlic, 1 clove",
        source: "SEEDED",
        overridden: false,
      });
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");
      const { revalidatePath } = await import("next/cache");

      const result = await actions.deleteIngredient(seededId);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("SEEDED_NOT_DELETABLE");
      expect(revalidatePath).not.toHaveBeenCalled();

      const raw = openRawDb(dbPath);
      const row = raw.prepare("SELECT * FROM ingredient WHERE id = ?").get(seededId);
      raw.close();
      expect(row).toBeDefined();
    });

    it("rejects deletion of an overridden, referenced SEEDED ingredient the same way (regardless of references)", async () => {
      const setupSqlite = openRawDb(dbPath);
      const seededId = insertRawIngredient(setupSqlite, {
        seedKey: "usda:20040",
        name: "Rice, white, long-grain",
        source: "SEEDED",
        overridden: true,
      });
      const recipeId = insertRawRecipe(setupSqlite, { name: "Fried Rice" });
      insertRawRecipeLine(setupSqlite, recipeId, seededId);
      insertRawPantryItem(setupSqlite, seededId);
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");

      const result = await actions.deleteIngredient(seededId);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("SEEDED_NOT_DELETABLE");

      const raw = openRawDb(dbPath);
      const row = raw.prepare("SELECT * FROM ingredient WHERE id = ?").get(seededId);
      raw.close();
      expect(row).toBeDefined();
    });
  });

  describe("nonexistent id", () => {
    it("returns ok:false with error.code NOT_FOUND and writes nothing", async () => {
      const actions = await import("@/app/actions/ingredient-actions");

      const result = await actions.deleteIngredient(999_999);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("NOT_FOUND");

      const raw = openRawDb(dbPath);
      const count = countRows(raw, "ingredient");
      raw.close();
      expect(count).toBe(0);
    });
  });

  describe("FK RESTRICT race backstop (AC-4, architecture.md §6)", () => {
    it("catches a residual FK RESTRICT violation when a reference appears between the check and the delete, mapping it to the same REFERENCED shape", async () => {
      const setupSqlite = openRawDb(dbPath);
      const customId = insertRawIngredient(setupSqlite, { name: "Race Ingredient", source: "CUSTOM" });
      setupSqlite.close();

      // Fake out the friendly pre-check to report "no references" while a
      // real referencing row is inserted directly afterward — simulating
      // another request racing in between the check and the delete. The
      // DB's actual `ON DELETE RESTRICT` constraint (architecture.md §4)
      // is what must then fire and be caught by the action itself.
      vi.doMock("@/data/ingredients", async (importOriginal) => {
        const actual = await importOriginal<typeof import("@/data/ingredients")>();
        return {
          ...actual,
          getIngredientReferences: vi.fn().mockResolvedValue({ recipes: [], inPantry: false }),
        };
      });

      const raceSqlite = openRawDb(dbPath);
      const raceRecipeId = insertRawRecipe(raceSqlite, { name: "Race Recipe" });
      insertRawRecipeLine(raceSqlite, raceRecipeId, customId);
      raceSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");
      const result = await actions.deleteIngredient(customId);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("REFERENCED");

      const raw = openRawDb(dbPath);
      const row = raw.prepare("SELECT * FROM ingredient WHERE id = ?").get(customId);
      raw.close();
      expect(row).toBeDefined();
    });
  });
});
