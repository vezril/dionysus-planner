import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { countRows, insertRawIngredient } from "./support/rawFixtures";

/**
 * S-302: `createIngredient` / `overrideIngredientNutrition` Server Actions.
 *
 * Traces to docs/stories/S-302-ingredient-create-override.md AC-1 through
 * AC-6, architecture.md §4 (Ingredient fields, the `overridden` flag
 * transition — "set to true the first time a SEEDED ingredient's nutrition
 * fields are edited... meaningless for CUSTOM rows"), §5 (Server Actions
 * colocated in `/app/actions/*`), §6 error-handling strategy (the
 * discriminated-union action result — "never throw across the boundary for
 * expected failures"), ADR-005 (server re-parses with the SAME Zod schema
 * the client used — never trust client validation as authorization to
 * write). Covers FR-2, FR-3, FR-12.
 *
 * `app/actions/ingredient-actions.ts` currently only contains the S-101
 * scaffold `.gitkeep` (no module) — every test below is intentionally RED
 * (dynamic-import module-not-found) until the implementer builds it.
 *
 * Called directly as plain async functions (architecture.md §3 ADR-007's
 * integration-test strategy — "call... Server Actions directly, as plain
 * async function calls, not over HTTP"); the `"use server"` directive at
 * the top of the real file is inert here since these tests run outside
 * Next.js's build pipeline, exactly like `tests/integration/api-ingredients
 * .test.ts` already does for the sibling Route Handler.
 *
 * `next/cache`'s `revalidatePath` throws when called outside a live Next.js
 * request context (no request-scoped cache to invalidate) — mocked here
 * with the lightest touch (`vi.mock`) so the actions stay plain-function
 * testable, per this story's own guidance.
 *
 * ============================ PINNED CONTRACT ============================
 * import { ingredientSchema } from "@/domain/validation/ingredient.schema";
 * import type { IngredientRecord } from "@/data/repositories/ingredientRepo";
 *
 * export interface ActionError {
 *   code: string;                           // "VALIDATION_ERROR" for a failed
 *                                            // ingredientSchema re-parse (pinned
 *                                            // exact value below)
 *   message: string;                        // non-empty, human-readable
 *   fieldErrors?: Record<string, string[]>;  // ingredientSchema's own
 *                                            // `.flatten().fieldErrors`, forwarded verbatim
 * }
 * export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };
 *
 * export async function createIngredient(input: unknown): Promise<ActionResult<IngredientRecord>>
 *   - Re-parses `input` with `ingredientSchema` (ADR-005). Invalid =>
 *     { ok: false, error: { code: "VALIDATION_ERROR", message, fieldErrors } },
 *     and NO row is written.
 *   - Valid => inserts via ingredientRepo.create with `source: "CUSTOM"`,
 *     `overridden: false` (this action never sets `overridden` true on create
 *     — that only ever happens through overrideIngredientNutrition on a
 *     SEEDED row). Optional fields not supplied by the caller persist as
 *     `null` (A-1).
 *   - On success, calls `revalidatePath("/ingredients")` (S-301 catalog)
 *     before returning `{ ok: true, data }`, where `data` is the full
 *     persisted `IngredientRecord` (including its new `id`).
 *
 * export async function overrideIngredientNutrition(id: number, input: unknown): Promise<ActionResult<IngredientRecord>>
 *   - Re-parses `input` with the SAME `ingredientSchema` (ADR-005 — one
 *     schema, both actions). Invalid => same VALIDATION_ERROR shape as
 *     above, and the target row is NOT modified.
 *   - Valid, target row `source === "SEEDED"` and currently `overridden ===
 *     false` => the write also sets `overridden: true` in the same
 *     transaction/update (FR-3's flag transition — the repo layer never
 *     does this on its own; this action is the one place it happens).
 *   - Valid, target row already `overridden === true` (seeded or custom) =>
 *     values update; flag stays `true` (idempotent, AC-6).
 *   - Valid, target row `source === "CUSTOM"` => values update; `overridden`
 *     is never flipped true by this path (AC-5 — stays false/meaningless).
 *   - `id`, `seedKey`, and `source` are never part of the writable patch —
 *     identity is untouched no matter what `input` contains (the schema
 *     itself carries none of these fields).
 *   - On success, calls `revalidatePath("/ingredients")` before returning
 *     `{ ok: true, data }`.
 * ===========================================================================
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const VALID_CREATE_INPUT = {
  name: "Homemade Almond Milk",
  unitClass: "VOLUME" as const,
  caloriesPerRef: 39,
  proteinPerRef: 1.5,
  carbsPerRef: 1.2,
  fatPerRef: 2.9,
  fiberPerRef: null,
  sugarPerRef: null,
  sodiumMgPerRef: 63,
  densityGPerMl: null,
};

function openRawDb(dbPath: string): Database.Database {
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

describe("app/actions/ingredient-actions", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-ingredient-actions-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    vi.resetModules();

    const setupSqlite = openRawDb(dbPath);
    runMigrations(setupSqlite);
    setupSqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("createIngredient", () => {
    it("creates a retrievable CUSTOM ingredient with overridden=false from valid input (FR-2 AC-1)", async () => {
      const actions = await import("@/app/actions/ingredient-actions");

      const result = await actions.createIngredient(VALID_CREATE_INPUT);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.name).toBe(VALID_CREATE_INPUT.name);
      expect(result.data.unitClass).toBe("VOLUME");
      expect(result.data.source).toBe("CUSTOM");
      expect(result.data.overridden).toBe(false);
      expect(typeof result.data.id).toBe("number");

      const raw = openRawDb(dbPath);
      const row = raw.prepare("SELECT * FROM ingredient WHERE id = ?").get(result.data.id) as
        | Record<string, unknown>
        | undefined;
      raw.close();
      expect(row).toBeDefined();
      expect(row?.name).toBe(VALID_CREATE_INPUT.name);
      expect(row?.source).toBe("CUSTOM");
      expect(row?.overridden).toBe(0);
    });

    it("returns ok:false with field errors and writes nothing for invalid input (FR-2 AC-2, negative macro + missing name)", async () => {
      const actions = await import("@/app/actions/ingredient-actions");

      const invalidInput = {
        ...VALID_CREATE_INPUT,
        name: "",
        proteinPerRef: -5,
      };

      const result = await actions.createIngredient(invalidInput);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(typeof result.error.message).toBe("string");
      expect(result.error.message.length).toBeGreaterThan(0);
      expect(result.error.fieldErrors?.name).toBeDefined();
      expect(result.error.fieldErrors?.proteinPerRef).toBeDefined();

      const raw = openRawDb(dbPath);
      const count = countRows(raw, "ingredient");
      raw.close();
      expect(count).toBe(0);
    });

    it("persists optional fiber/sugar/sodium/density when provided, and stores null when omitted (A-1/FR-12, AC-3)", async () => {
      const actions = await import("@/app/actions/ingredient-actions");

      const withOptionals = await actions.createIngredient({
        ...VALID_CREATE_INPUT,
        name: "Ingredient With Optionals",
        fiberPerRef: 0.4,
        sugarPerRef: 0.6,
        sodiumMgPerRef: 63,
        densityGPerMl: 1.03,
      });
      expect(withOptionals.ok).toBe(true);
      if (withOptionals.ok) {
        expect(withOptionals.data.fiberPerRef).toBe(0.4);
        expect(withOptionals.data.sugarPerRef).toBe(0.6);
        expect(withOptionals.data.sodiumMgPerRef).toBe(63);
        expect(withOptionals.data.densityGPerMl).toBe(1.03);
      }

      const withoutOptionalsInput = { ...VALID_CREATE_INPUT, name: "Ingredient Without Optionals" };
      delete (withoutOptionalsInput as Record<string, unknown>).fiberPerRef;
      delete (withoutOptionalsInput as Record<string, unknown>).sugarPerRef;
      delete (withoutOptionalsInput as Record<string, unknown>).sodiumMgPerRef;
      delete (withoutOptionalsInput as Record<string, unknown>).densityGPerMl;

      const withoutOptionals = await actions.createIngredient(withoutOptionalsInput);
      expect(withoutOptionals.ok).toBe(true);
      if (withoutOptionals.ok) {
        expect(withoutOptionals.data.fiberPerRef).toBeNull();
        expect(withoutOptionals.data.sugarPerRef).toBeNull();
        expect(withoutOptionals.data.sodiumMgPerRef).toBeNull();
        expect(withoutOptionals.data.densityGPerMl).toBeNull();
      }
    });

    it("revalidates the ingredient catalog path on successful create", async () => {
      const actions = await import("@/app/actions/ingredient-actions");
      const { revalidatePath } = await import("next/cache");

      const result = await actions.createIngredient(VALID_CREATE_INPUT);

      expect(result.ok).toBe(true);
      expect(revalidatePath).toHaveBeenCalledWith("/ingredients");
    });
  });

  describe("overrideIngredientNutrition", () => {
    it("sets overridden=true and updates nutrition when editing a SEEDED ingredient's calories (FR-3 AC-4)", async () => {
      const setupSqlite = openRawDb(dbPath);
      const seededId = insertRawIngredient(setupSqlite, {
        seedKey: "usda:11215",
        name: "Garlic, 1 clove",
        unitClass: "COUNT",
        caloriesPerRef: 4,
        proteinPerRef: 0.2,
        carbsPerRef: 1,
        fatPerRef: 0,
        source: "SEEDED",
        overridden: false,
      });
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");

      const result = await actions.overrideIngredientNutrition(seededId, {
        name: "Garlic, 1 clove",
        unitClass: "COUNT",
        caloriesPerRef: 5,
        proteinPerRef: 0.2,
        carbsPerRef: 1,
        fatPerRef: 0,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.id).toBe(seededId);
      expect(result.data.caloriesPerRef).toBe(5);
      expect(result.data.overridden).toBe(true);
      expect(result.data.source).toBe("SEEDED");
      expect(result.data.seedKey).toBe("usda:11215");

      const raw = openRawDb(dbPath);
      const row = raw.prepare("SELECT * FROM ingredient WHERE id = ?").get(seededId) as Record<string, unknown>;
      raw.close();
      expect(row.caloriesPerRef).toBe(5);
      expect(row.overridden).toBe(1);
    });

    it("keeps overridden=true and updates values when editing an already-overridden seeded ingredient again (AC-6)", async () => {
      const setupSqlite = openRawDb(dbPath);
      const seededId = insertRawIngredient(setupSqlite, {
        seedKey: "usda:11215",
        name: "Garlic, 1 clove",
        unitClass: "COUNT",
        caloriesPerRef: 5,
        proteinPerRef: 0.2,
        carbsPerRef: 1,
        fatPerRef: 0,
        source: "SEEDED",
        overridden: true,
      });
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");

      const result = await actions.overrideIngredientNutrition(seededId, {
        name: "Garlic, 1 clove",
        unitClass: "COUNT",
        caloriesPerRef: 6,
        proteinPerRef: 0.2,
        carbsPerRef: 1,
        fatPerRef: 0,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.overridden).toBe(true);
      expect(result.data.caloriesPerRef).toBe(6);
    });

    it("updates a CUSTOM ingredient without semantic use of the overridden flag (AC-5: stays false)", async () => {
      const setupSqlite = openRawDb(dbPath);
      const customId = insertRawIngredient(setupSqlite, {
        seedKey: null,
        name: "My Custom Trail Mix",
        unitClass: "MASS",
        caloriesPerRef: 450,
        proteinPerRef: 12,
        carbsPerRef: 40,
        fatPerRef: 25,
        source: "CUSTOM",
        overridden: false,
      });
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");

      const result = await actions.overrideIngredientNutrition(customId, {
        name: "My Custom Trail Mix",
        unitClass: "MASS",
        caloriesPerRef: 475,
        proteinPerRef: 12,
        carbsPerRef: 40,
        fatPerRef: 25,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.caloriesPerRef).toBe(475);
      expect(result.data.overridden).toBe(false);
      expect(result.data.source).toBe("CUSTOM");
    });

    it("never changes identity fields id/seedKey/source, regardless of edit content", async () => {
      const setupSqlite = openRawDb(dbPath);
      const seededId = insertRawIngredient(setupSqlite, {
        seedKey: "usda:11215",
        name: "Garlic, 1 clove",
        unitClass: "COUNT",
        source: "SEEDED",
        overridden: false,
      });
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");

      const result = await actions.overrideIngredientNutrition(seededId, {
        name: "Garlic, renamed",
        unitClass: "COUNT",
        caloriesPerRef: 10,
        proteinPerRef: 1,
        carbsPerRef: 2,
        fatPerRef: 0.5,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.id).toBe(seededId);
      expect(result.data.seedKey).toBe("usda:11215");
      expect(result.data.source).toBe("SEEDED");
    });

    it("returns ok:false with field errors and writes nothing for invalid input", async () => {
      const setupSqlite = openRawDb(dbPath);
      const seededId = insertRawIngredient(setupSqlite, {
        seedKey: "usda:11215",
        name: "Garlic, 1 clove",
        unitClass: "COUNT",
        caloriesPerRef: 4,
        proteinPerRef: 0.2,
        carbsPerRef: 1,
        fatPerRef: 0,
        source: "SEEDED",
        overridden: false,
      });
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");

      const result = await actions.overrideIngredientNutrition(seededId, {
        name: "Garlic, 1 clove",
        unitClass: "COUNT",
        caloriesPerRef: 4,
        proteinPerRef: 0.2,
        carbsPerRef: 1,
        fatPerRef: -3,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.fieldErrors?.fatPerRef).toBeDefined();

      const raw = openRawDb(dbPath);
      const row = raw.prepare("SELECT * FROM ingredient WHERE id = ?").get(seededId) as Record<string, unknown>;
      raw.close();
      expect(row.caloriesPerRef).toBe(4);
      expect(row.overridden).toBe(0);
    });

    it("revalidates the ingredient catalog path on successful override", async () => {
      const setupSqlite = openRawDb(dbPath);
      const seededId = insertRawIngredient(setupSqlite, { source: "SEEDED", overridden: false });
      setupSqlite.close();

      const actions = await import("@/app/actions/ingredient-actions");
      const { revalidatePath } = await import("next/cache");

      const result = await actions.overrideIngredientNutrition(seededId, {
        name: "Test Ingredient",
        unitClass: "MASS",
        caloriesPerRef: 41,
        proteinPerRef: 1.1,
        carbsPerRef: 9.3,
        fatPerRef: 0.1,
      });

      expect(result.ok).toBe(true);
      expect(revalidatePath).toHaveBeenCalledWith("/ingredients");
    });
  });
});
