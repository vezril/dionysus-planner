import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { toCanonical } from "@/domain/units";
import { countRows, insertRawIngredient, insertRawPantryItem } from "./support/rawFixtures";

// revalidatePath throws outside a live request context — mocked here exactly
// as in pantry-actions.test.ts / ingredient-actions.test.ts / recipe-actions.test.ts.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * S-305: `updatePantryItem` Server Action + FR-8's matching-exclusion proxy
 * for the already-existing `deletePantryItem` (docs/stories/
 * S-305-pantry-edit-remove.md AC1-AC4, architecture.md §4 PantryItem,
 * §6 error handling).
 *
 * `updatePantryItem` does not exist yet in `app/actions/pantry-actions.ts`
 * (only `addOrUpdatePantryItem` and `deletePantryItem` — see
 * tests/integration/pantry-actions.test.ts, S-304) — every test in the
 * first describe block below is intentionally RED (module has no such
 * export) until the implementer adds it. The `deletePantryItem` +
 * `getAllAsIndex` block exercises FR-8 against the ALREADY-GREEN
 * `deletePantryItem` (S-304) and the already-green `pantryRepo.
 * getAllAsIndex` (S-202) — that block should already pass and is included
 * here as a pinned regression/behavior proof for this story's AC3, not as
 * new RED.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * export async function updatePantryItem(
 *   id: number,
 *   input: { quantity: number; unit: string },
 * ): Promise<PantryActionResult>
 *
 * Reuses `PantryActionResult`/`PantryActionError` from
 * `app/actions/pantry-actions.ts` (S-304). Only the `VALIDATION_ERROR`
 * code applies here — there is no ingredient choice to make when editing
 * an already-identified row by `id`.
 *
 * Behavior pinned by the story + architecture.md §4:
 *  - Given a valid `{ quantity, unit }` for an EXISTING pantry row `id`,
 *    `quantityCanonical`/`entryUnitClass` are rewritten via
 *    `toCanonical(quantity, unit)` (never hand-duplicated math), and
 *    `displayQuantity`/`displayUnit` are stored verbatim (FR-9's
 *    redisplay contract, same as add/replace).
 *  - Editing to a unit in a DIFFERENT class than the row's current class
 *    is legal (Dev Notes: "Editing to a unit in a different class is
 *    legal... it simply changes `entryUnitClass`") — this is NOT a
 *    validation error, unlike `addOrUpdatePantryItem`'s increment path.
 *  - Non-positive quantity or an unknown unit key => `{ ok: false, error:
 *    { code: "VALIDATION_ERROR", fieldErrors } }` (ADR-005 independent
 *    server-side re-validation), and the existing row is left completely
 *    untouched (never a partial/silent write).
 * ===========================================================================
 */
describe("app/actions/pantry-actions: updatePantryItem (S-305)", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-pantry-edit-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    vi.resetModules();

    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);
    setupSqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  function openRawDb(): Database.Database {
    return new Database(dbPath);
  }

  describe("same-class edit (AC1/AC2, FR-7/FR-9)", () => {
    it("rewrites canonical + display + entryUnitClass consistently for a new quantity in the same class", async () => {
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Almonds, raw", unitClass: "MASS" });
      const pantryItemId = insertRawPantryItem(sqlite, ingredientId, {
        quantityCanonical: 907.184, // 2 lb
        entryUnitClass: "MASS",
        displayQuantity: 2,
        displayUnit: "lb",
      });
      sqlite.close();

      const { updatePantryItem } = await import("@/app/actions/pantry-actions");
      const result = await updatePantryItem(pantryItemId, { quantity: 1, unit: "lb" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const expected = toCanonical(1, "lb");
        expect(result.data.quantityCanonical).toBeCloseTo(expected.quantityCanonical, 5);
        expect(result.data.entryUnitClass).toBe("MASS");
        expect(result.data.displayQuantity).toBe(1);
        expect(result.data.displayUnit).toBe("lb");
      }

      const readBack = openRawDb();
      expect(countRows(readBack, "pantry_item")).toBe(1); // edit never creates a second row
      const row = readBack
        .prepare("SELECT quantityCanonical, displayQuantity, displayUnit FROM pantry_item WHERE id = ?")
        .get(pantryItemId) as { quantityCanonical: number; displayQuantity: number; displayUnit: string };
      expect(row.quantityCanonical).toBeCloseTo(453.592, 1);
      expect(row.displayQuantity).toBe(1);
      expect(row.displayUnit).toBe("lb");
      readBack.close();
    });
  });

  describe("cross-class edit (Dev Notes: legal, not a validation error)", () => {
    it("rewrites entryUnitClass to the new unit's class and its canonical value accordingly", async () => {
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Blueberries, fresh", unitClass: "MASS" });
      const pantryItemId = insertRawPantryItem(sqlite, ingredientId, {
        quantityCanonical: 500,
        entryUnitClass: "MASS",
        displayQuantity: 500,
        displayUnit: "g",
      });
      sqlite.close();

      const { updatePantryItem } = await import("@/app/actions/pantry-actions");
      const result = await updatePantryItem(pantryItemId, { quantity: 3, unit: "cup" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.entryUnitClass).toBe("VOLUME");
        expect(result.data.quantityCanonical).toBe(720); // 3 * 240 mL
        expect(result.data.displayQuantity).toBe(3);
        expect(result.data.displayUnit).toBe("cup");
      }

      const readBack = openRawDb();
      const row = readBack
        .prepare("SELECT entryUnitClass, quantityCanonical FROM pantry_item WHERE id = ?")
        .get(pantryItemId) as { entryUnitClass: string; quantityCanonical: number };
      expect(row.entryUnitClass).toBe("VOLUME");
      expect(row.quantityCanonical).toBe(720);
      readBack.close();
    });
  });

  describe("invalid edits (AC4, ADR-005 independent re-validation)", () => {
    it("rejects a non-positive quantity with fieldErrors and leaves the existing row untouched", async () => {
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Almonds, raw", unitClass: "MASS" });
      const pantryItemId = insertRawPantryItem(sqlite, ingredientId, {
        quantityCanonical: 100,
        entryUnitClass: "MASS",
        displayQuantity: 100,
        displayUnit: "g",
      });
      sqlite.close();

      const { updatePantryItem } = await import("@/app/actions/pantry-actions");
      const result = await updatePantryItem(pantryItemId, { quantity: 0, unit: "g" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.fieldErrors?.quantity?.length).toBeGreaterThan(0);
      }

      const readBack = openRawDb();
      const row = readBack
        .prepare("SELECT quantityCanonical, displayQuantity, displayUnit FROM pantry_item WHERE id = ?")
        .get(pantryItemId) as { quantityCanonical: number; displayQuantity: number; displayUnit: string };
      expect(row.quantityCanonical).toBe(100);
      expect(row.displayQuantity).toBe(100);
      expect(row.displayUnit).toBe("g");
      readBack.close();
    });

    it("rejects an unknown unit with fieldErrors and leaves the existing row untouched", async () => {
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Almonds, raw", unitClass: "MASS" });
      const pantryItemId = insertRawPantryItem(sqlite, ingredientId, {
        quantityCanonical: 100,
        entryUnitClass: "MASS",
        displayQuantity: 100,
        displayUnit: "g",
      });
      sqlite.close();

      const { updatePantryItem } = await import("@/app/actions/pantry-actions");
      const result = await updatePantryItem(pantryItemId, { quantity: 1, unit: "bushels" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.fieldErrors?.unit?.length).toBeGreaterThan(0);
      }

      const readBack = openRawDb();
      const row = readBack
        .prepare("SELECT quantityCanonical, entryUnitClass FROM pantry_item WHERE id = ?")
        .get(pantryItemId) as { quantityCanonical: number; entryUnitClass: string };
      expect(row.quantityCanonical).toBe(100);
      expect(row.entryUnitClass).toBe("MASS");
      readBack.close();
    });
  });
});

/**
 * FR-8 matching-exclusion proxy (AC3): "removed from the list ... excluded
 * from all subsequent matching calculations ... here via the repo/index
 * level." `deletePantryItem` and `pantryRepo.getAllAsIndex` both already
 * exist and are already green (S-304/S-202 respectively) — this block pins
 * the composition of the two as the concrete stand-in for "matching
 * exclusion" until S-501 exists, per the story's own AC3 wording. It is
 * NOT expected to be RED.
 */
describe("app/actions/pantry-actions: deletePantryItem excludes the ingredient from getAllAsIndex (S-305 AC3)", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-pantry-edit-index-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    vi.resetModules();

    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);
    setupSqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("no longer contains the ingredient's entry once its pantry row is deleted", async () => {
    const sqlite = openRawDbFor(dbPath);
    const keptIngredientId = insertRawIngredient(sqlite, { name: "Almonds, raw", unitClass: "MASS" });
    const removedIngredientId = insertRawIngredient(sqlite, { name: "Blueberries, fresh", unitClass: "MASS" });
    insertRawPantryItem(sqlite, keptIngredientId, {
      quantityCanonical: 200,
      entryUnitClass: "MASS",
      displayQuantity: 200,
      displayUnit: "g",
    });
    const removedPantryItemId = insertRawPantryItem(sqlite, removedIngredientId, {
      quantityCanonical: 300,
      entryUnitClass: "MASS",
      displayQuantity: 300,
      displayUnit: "g",
    });
    sqlite.close();

    const { deletePantryItem } = await import("@/app/actions/pantry-actions");
    const result = await deletePantryItem(removedPantryItemId);
    expect(result.ok).toBe(true);

    const { createDb } = await import("@/data/db");
    const { getAllAsIndex } = await import("@/data/repositories/pantryRepo");
    const db = createDb();
    const index = await getAllAsIndex(db);
    db.$client.close();

    expect(index.has(removedIngredientId)).toBe(false);
    expect(index.has(keptIngredientId)).toBe(true);
    expect(index.get(keptIngredientId)).toEqual({ qtyCanonical: 200, class: "MASS" });
  });
});

function openRawDbFor(path: string): Database.Database {
  return new Database(path);
}
