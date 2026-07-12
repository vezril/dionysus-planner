import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { resolveQuantityForComparison, toCanonical } from "@/domain/units";
import { countRows, insertRawIngredient, insertRawPantryItem } from "./support/rawFixtures";

// revalidatePath throws outside a live request context — mocked here exactly
// as in ingredient-actions.test.ts and recipe-actions.test.ts.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * S-304: `addOrUpdatePantryItem` / `deletePantryItem` Server Actions.
 *
 * Traces to docs/stories/S-304-pantry-add-upsert.md AC1-AC6, AC8 and
 * architecture.md §4 PantryItem's increment semantics (the `ingredientId`
 * field note — reject cross-class increment without density, offer
 * replace) + §6 error-handling discriminated union.
 *
 * `app/actions/pantry-actions.ts` does not exist yet (only
 * `app/actions/.gitkeep`) — every test below is intentionally RED
 * (module-not-found) until the implementer builds it.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * "use server";
 * export async function addOrUpdatePantryItem(
 *   input: { ingredientId: number; quantity: number; unit: string; mode?: "new" | "increment" | "replace" }
 * ): Promise<PantryActionResult>
 *
 * export async function deletePantryItem(id: number): Promise<PantryDeleteResult>
 *
 * type PantryActionResult =
 *   | { ok: true; data: PantryItemRecord }              // pantryRepo.ts's shape
 *   | { ok: false; error: PantryActionError };
 *
 * type PantryActionError =
 *   | { code: "VALIDATION_ERROR"; message: string; fieldErrors: Record<string, string[]> }
 *   | { code: "NEEDS_CHOICE"; message: string; existing: PantryItemRecord }
 *   | { code: "INCREMENT_REJECTED_NO_DENSITY"; message: string; existing: PantryItemRecord };
 *
 * type PantryDeleteResult = { ok: true } | { ok: false; error: { code: string; message: string } };
 *
 * Behavior pinned by architecture.md §4 / the story:
 *  - No existing row for `ingredientId` => `mode` is irrelevant; a new row
 *    is created. `quantityCanonical`/`entryUnitClass` come from
 *    `toCanonical(quantity, unit)`; `displayQuantity`/`displayUnit` are
 *    the raw input verbatim (FR-9).
 *  - An existing row + `mode` omitted => `{ ok: false, error: { code:
 *    "NEEDS_CHOICE", existing } }`. NO row is created or mutated — the
 *    pantry still holds exactly the one pre-existing row.
 *  - An existing row + `mode: "increment"`, same `entryUnitClass` as the
 *    incoming unit's class => incoming converts to canonical and sums
 *    onto the existing row's `quantityCanonical`. `entryUnitClass` is
 *    unchanged (the existing row's basis, per architecture's "existing
 *    row's canonical basis" wording).
 *  - An existing row + `mode: "increment"`, DIFFERENT class, ingredient
 *    HAS a density => the incoming quantity density-converts (exactly
 *    `resolveQuantityForComparison(incomingCanonical, incomingClass,
 *    existingClass, densityGPerMl)`) onto the existing row's canonical
 *    basis and sums. `entryUnitClass` stays the existing row's class.
 *  - An existing row + `mode: "increment"`, DIFFERENT class, ingredient
 *    has NO density => `{ ok: false, error: { code:
 *    "INCREMENT_REJECTED_NO_DENSITY", message (mentions "replace"),
 *    existing } }`. The existing row is NOT mutated (never a silent
 *    guess).
 *  - Any existing row + `mode: "replace"` => full overwrite of
 *    `quantityCanonical`/`entryUnitClass`/`displayQuantity`/
 *    `displayUnit` with the new entry's values, regardless of class
 *    match (replace never rejects).
 *  - Invalid input (per `pantryItemSchema`) => `{ ok: false, error:
 *    { code: "VALIDATION_ERROR", fieldErrors } }` — the Server Action
 *    independently re-validates; a client bypassing its own inline
 *    validation must still be rejected (ADR-005).
 *  - The `pantry_item.ingredientId` UNIQUE constraint is never tripped —
 *    every scenario above ends with exactly one row per ingredientId.
 *  - Opens its own DB connection per call via `data/db.ts`'s `createDb()`
 *    (resolves `DB_PATH` from the environment), mirroring
 *    `data/ingredients.ts`'s per-call-connection pattern — no module-
 *    scope singleton, so this suite's per-test `DB_PATH` +
 *    `vi.resetModules()` setup is actually observed.
 *
 * NOTE ON DISPLAY FIELDS AFTER INCREMENT: the story/architecture pin the
 * CANONICAL sum precisely (AC3's "existing 500 g + incoming 1 lb -> ~=
 * 953.592 g") but do not pin what `displayQuantity`/`displayUnit` should
 * read afterward. This suite takes the position that the display fields
 * should reflect the just-submitted entry (the freshest "as entered"
 * values, consistent with FR-9's "or the user's chosen display unit"
 * phrasing) — flagged here explicitly as an interpretation, not a
 * silently-guessed spec fact, open to revision if the human reviewer
 * disagrees.
 * ===========================================================================
 */
describe("app/actions/pantry-actions", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-pantry-actions-test-${randomUUID()}-`));
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

  describe("fresh add (AC1, FR-9 round-trip)", () => {
    it("creates a new row with canonical + verbatim display values when none existed", async () => {
      const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Broccoli, raw", unitClass: "MASS" });
      sqlite.close();

      const result = await addOrUpdatePantryItem({ ingredientId, quantity: 2, unit: "lb" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.ingredientId).toBe(ingredientId);
        expect(result.data.entryUnitClass).toBe("MASS");
        expect(result.data.quantityCanonical).toBeCloseTo(907.184, 1);
        expect(result.data.displayQuantity).toBe(2);
        expect(result.data.displayUnit).toBe("lb");
      }

      const readBack = openRawDb();
      expect(countRows(readBack, "pantry_item")).toBe(1);
      readBack.close();
    });

    it("treats an explicit mode: 'new' the same as omitting mode, for a brand-new ingredient", async () => {
      const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Cauliflower, raw", unitClass: "MASS" });
      sqlite.close();

      const result = await addOrUpdatePantryItem({ ingredientId, quantity: 500, unit: "g", mode: "new" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.quantityCanonical).toBe(500);
      }
    });
  });

  describe("duplicate add without a mode choice (AC2: one row, never two)", () => {
    it("returns a NEEDS_CHOICE result and does not create or mutate a second row", async () => {
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Spinach, raw", unitClass: "MASS" });
      insertRawPantryItem(sqlite, ingredientId, {
        quantityCanonical: 100,
        entryUnitClass: "MASS",
        displayQuantity: 100,
        displayUnit: "g",
      });
      sqlite.close();

      const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
      const result = await addOrUpdatePantryItem({ ingredientId, quantity: 200, unit: "g" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("NEEDS_CHOICE");
        expect(result.error.existing).toBeDefined();
        expect(result.error.existing?.quantityCanonical).toBe(100);
      }

      const readBack = openRawDb();
      expect(countRows(readBack, "pantry_item")).toBe(1);
      const row = readBack.prepare("SELECT quantityCanonical FROM pantry_item WHERE ingredientId = ?").get(ingredientId) as {
        quantityCanonical: number;
      };
      expect(row.quantityCanonical).toBe(100); // unchanged — never a silent write
      readBack.close();
    });
  });

  describe("increment, same class (AC3, FR-10 path)", () => {
    it("converts the incoming quantity to the existing row's canonical basis and sums", async () => {
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Flour, all-purpose", unitClass: "MASS" });
      insertRawPantryItem(sqlite, ingredientId, {
        quantityCanonical: 500,
        entryUnitClass: "MASS",
        displayQuantity: 500,
        displayUnit: "g",
      });
      sqlite.close();

      const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
      const result = await addOrUpdatePantryItem({ ingredientId, quantity: 1, unit: "lb", mode: "increment" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // 500 g + 1 lb (453.592 g) ~= 953.592 g — architecture.md §4's own example.
        expect(result.data.quantityCanonical).toBeCloseTo(953.592, 1);
        expect(result.data.entryUnitClass).toBe("MASS");
      }

      const readBack = openRawDb();
      expect(countRows(readBack, "pantry_item")).toBe(1); // still one row
      readBack.close();
    });
  });

  describe("increment, cross-class WITH density (AC4, FR-12 path)", () => {
    it("density-converts the incoming quantity onto the existing row's canonical basis and sums", async () => {
      const sqlite = openRawDb();
      const densityGPerMl = 0.955;
      const ingredientId = insertRawIngredient(sqlite, {
        name: "Butter, salted",
        unitClass: "MASS",
        densityGPerMl,
      });
      insertRawPantryItem(sqlite, ingredientId, {
        quantityCanonical: 200,
        entryUnitClass: "MASS",
        displayQuantity: 200,
        displayUnit: "g",
      });
      sqlite.close();

      const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
      const result = await addOrUpdatePantryItem({ ingredientId, quantity: 10, unit: "tbsp", mode: "increment" });

      // Compute the expected sum via the exact same pure domain function
      // the action is expected to reuse (architecture.md §4), rather than
      // hand-duplicating the density math and risking a copy/paste error.
      const incoming = toCanonical(10, "tbsp");
      const convertedOntoExistingBasis = resolveQuantityForComparison(
        incoming.quantityCanonical,
        incoming.entryUnitClass,
        "MASS",
        densityGPerMl,
      );
      expect(convertedOntoExistingBasis).not.toBe("UNRESOLVED");
      const expectedTotal = 200 + (convertedOntoExistingBasis as number);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.quantityCanonical).toBeCloseTo(expectedTotal, 1);
        expect(result.data.entryUnitClass).toBe("MASS");
      }

      const readBack = openRawDb();
      expect(countRows(readBack, "pantry_item")).toBe(1);
      readBack.close();
    });
  });

  describe("increment, cross-class WITHOUT density (AC5: reject, offer replace — never a silent guess)", () => {
    it("rejects the increment with an explanatory error and leaves the existing row untouched", async () => {
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, {
        name: "Tomatoes, cherry",
        unitClass: "MASS",
        densityGPerMl: null,
      });
      insertRawPantryItem(sqlite, ingredientId, {
        quantityCanonical: 100,
        entryUnitClass: "MASS",
        displayQuantity: 100,
        displayUnit: "g",
      });
      sqlite.close();

      const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
      const result = await addOrUpdatePantryItem({ ingredientId, quantity: 1, unit: "cup", mode: "increment" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INCREMENT_REJECTED_NO_DENSITY");
        expect(result.error.message).toMatch(/replace/i);
        expect(result.error.existing).toBeDefined();
        expect(result.error.existing?.quantityCanonical).toBe(100);
      }

      const readBack = openRawDb();
      expect(countRows(readBack, "pantry_item")).toBe(1);
      const row = readBack.prepare("SELECT quantityCanonical, entryUnitClass FROM pantry_item WHERE ingredientId = ?").get(
        ingredientId,
      ) as { quantityCanonical: number; entryUnitClass: string };
      expect(row.quantityCanonical).toBe(100);
      expect(row.entryUnitClass).toBe("MASS");
      readBack.close();
    });
  });

  describe("replace (AC6: always overwrites, even cross-class)", () => {
    it("overwrites canonical + display + entryUnitClass with the new entry", async () => {
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Rice, white, raw", unitClass: "MASS" });
      insertRawPantryItem(sqlite, ingredientId, {
        quantityCanonical: 300,
        entryUnitClass: "MASS",
        displayQuantity: 300,
        displayUnit: "g",
      });
      sqlite.close();

      const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
      const result = await addOrUpdatePantryItem({ ingredientId, quantity: 3, unit: "cup", mode: "replace" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.entryUnitClass).toBe("VOLUME");
        expect(result.data.quantityCanonical).toBe(720); // 3 * 240 mL
        expect(result.data.displayQuantity).toBe(3);
        expect(result.data.displayUnit).toBe("cup");
      }

      const readBack = openRawDb();
      expect(countRows(readBack, "pantry_item")).toBe(1);
      readBack.close();
    });

    it("also overwrites successfully immediately after a rejected no-density increment (replace never rejects)", async () => {
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, {
        name: "Carrots, raw",
        unitClass: "MASS",
        densityGPerMl: null,
      });
      insertRawPantryItem(sqlite, ingredientId, {
        quantityCanonical: 150,
        entryUnitClass: "MASS",
        displayQuantity: 150,
        displayUnit: "g",
      });
      sqlite.close();

      const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
      const rejected = await addOrUpdatePantryItem({ ingredientId, quantity: 2, unit: "cup", mode: "increment" });
      expect(rejected.ok).toBe(false);

      const replaced = await addOrUpdatePantryItem({ ingredientId, quantity: 2, unit: "cup", mode: "replace" });
      expect(replaced.ok).toBe(true);
      if (replaced.ok) {
        expect(replaced.data.entryUnitClass).toBe("VOLUME");
        expect(replaced.data.quantityCanonical).toBe(480);
      }

      const readBack = openRawDb();
      expect(countRows(readBack, "pantry_item")).toBe(1);
      readBack.close();
    });
  });

  describe("invalid input (AC8, ADR-005: independent server-side re-validation)", () => {
    it("rejects a non-positive quantity with fieldErrors, never touching the DB", async () => {
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Garlic, raw", unitClass: "MASS" });
      sqlite.close();

      const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
      const result = await addOrUpdatePantryItem({ ingredientId, quantity: 0, unit: "g" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.fieldErrors?.quantity?.length).toBeGreaterThan(0);
      }

      const readBack = openRawDb();
      expect(countRows(readBack, "pantry_item")).toBe(0);
      readBack.close();
    });

    it("rejects an unknown unit with fieldErrors", async () => {
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Garlic, raw", unitClass: "MASS" });
      sqlite.close();

      const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
      const result = await addOrUpdatePantryItem({ ingredientId, quantity: 1, unit: "bushels" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.fieldErrors?.unit?.length).toBeGreaterThan(0);
      }
    });

    it("rejects a missing/non-positive ingredientId with fieldErrors (no ingredient selected)", async () => {
      const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
      // Exercising the runtime rejection of a client bypassing its own
      // required-field validation (the action accepts this shape at the type
      // level, so no @ts-expect-error is needed — Zod rejects it at runtime).
      const result = await addOrUpdatePantryItem({ ingredientId: undefined, quantity: 1, unit: "g" });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
        expect(result.error.fieldErrors?.ingredientId?.length).toBeGreaterThan(0);
      }
    });
  });

  describe("deletePantryItem", () => {
    it("removes the pantry row for the given id", async () => {
      const sqlite = openRawDb();
      const ingredientId = insertRawIngredient(sqlite, { name: "Eggs, whole", unitClass: "COUNT" });
      const pantryItemId = insertRawPantryItem(sqlite, ingredientId, {
        quantityCanonical: 6,
        entryUnitClass: "COUNT",
        displayQuantity: 6,
        displayUnit: "each",
      });
      sqlite.close();

      const { deletePantryItem } = await import("@/app/actions/pantry-actions");
      const result = await deletePantryItem(pantryItemId);

      expect(result.ok).toBe(true);

      const readBack = openRawDb();
      expect(countRows(readBack, "pantry_item")).toBe(0);
      readBack.close();
    });
  });
});
