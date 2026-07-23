import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { toCanonical } from "@/domain/units";
import {
  countRows,
  insertRawIngredient,
  insertRawPantryItem,
  insertRawRecipe,
  insertRawRecipeLine,
} from "./support/rawFixtures";

/**
 * S-402 recipe edit & delete — `app/actions/recipe-actions.ts#updateRecipe`
 * and `#deleteRecipe`. Traces to docs/stories/S-402-recipe-edit-delete.md's
 * two integration TEST tasks, prd.md FR-14/FR-15, architecture.md §4
 * (RecipeLine `ON DELETE CASCADE` on `recipeId`), §6 error-handling
 * discriminated union, ADR-005 (server independently re-validates), and
 * S-303/S-303-delete-test's already-green `NOT_FOUND` shape convention
 * (`tests/integration/ingredient-delete.test.ts`).
 *
 * `app/actions/recipe-actions.ts` currently exports only `createRecipe`
 * (S-401) — every test below is intentionally RED (no `updateRecipe` /
 * `deleteRecipe` export) until the implementer builds both, per the
 * story's IMPL tasks (`recipeRepo.updateWithLines` / `recipeRepo.remove`
 * already exist and are green — this suite pins the Server Action layer
 * on top of them).
 *
 * Same harness as tests/integration/recipe-actions.test.ts: a real
 * migrated file-backed SQLite DB per test (via `DB_PATH`), `next/cache`'s
 * `revalidatePath` mocked (inert outside a live Next.js request context —
 * this suite does not assert *how* it is invoked beyond the path argument
 * on success/no-call-on-failure, not a weakening of the behavior under
 * test). Recipe/line/pantry setup bypasses the repository layer via
 * `tests/integration/support/rawFixtures.ts`'s raw-SQL builders (same
 * pattern `ingredient-delete.test.ts` uses) so this suite doesn't depend
 * on `createRecipe`'s own correctness for its fixtures.
 *
 * ============================ PINNED CONTRACT ============================
 * export async function updateRecipe(id: number, input: unknown): Promise<UpdateRecipeResult>
 * export async function deleteRecipe(id: number): Promise<DeleteRecipeResult>
 *
 * type UpdateRecipeResult =
 *   | { ok: true; data: RecipeRecord & { lines: RecipeLineRecord[] } }
 *   | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } }
 *
 * type DeleteRecipeResult =
 *   | { ok: true; data: { id: number } }
 *   | { ok: false; error: { code: string; message: string } }
 *                                                          // architecture.md §6 discriminated union,
 *                                                          // reusing the SAME `ActionError` shape S-401/S-303 already pin.
 *
 * `updateRecipe`'s `input` (pre-validation) matches the SAME
 * `domain/validation/recipe.schema.ts#recipeSchema` `createRecipe` already
 * re-parses (Dev Notes: "Reuses S-401's schema... do not fork a second
 * editor"). openspec: cooklang-recipe-editor — `lines`/`instructions`
 * replaced by a single typed `body: string` (parsed via
 * `domain/cooklangParser.ts`, same as create):
 *   { name: string; servings: number; body: string }
 *
 * `updateRecipe` behavior:
 *   - Re-parses `input` with `recipeSchema` (ADR-005). A schema violation
 *     (incl. 0 lines, FR-13's invariant holding on edit too per AC3)
 *     returns `{ ok: false, error: { ..., fieldErrors } }` and leaves the
 *     target recipe + its lines completely UNTOUCHED — never a partial
 *     write.
 *   - Valid input replaces the recipe's metadata (name/servings/
 *     instructions) AND its full line set in ONE transaction
 *     (`recipeRepo.updateWithLines`'s replace-lines semantics, S-202) —
 *     old lines gone, new lines inserted, never a diff-and-patch.
 *   - Each line's `quantity`/`unit` is converted via
 *     `domain/units.ts#toCanonical` into `quantityCanonical`/
 *     `entryUnitClass`, with `quantity`/`unit` persisted verbatim as
 *     `displayQuantity`/`displayUnit` (FR-9, same as create).
 *   - An `ingredientId` that parses but doesn't reference an existing
 *     ingredient row trips the FK — this must be CAUGHT and mapped to
 *     `{ ok: false, error }` (never an unhandled exception), and the
 *     target recipe's PRE-EXISTING metadata + lines must be exactly as
 *     they were before the call (the replace-lines transaction rolls back
 *     atomically — architecture.md §6).
 *   - An `id` that doesn't resolve to any recipe => `{ ok: false, error:
 *     { code: "NOT_FOUND" } }`, no write, no revalidate.
 *   - Success calls `revalidatePath("/recipes")` (and, per FR-14's
 *     compute-fresh-per-view note, no separate `/recipes/<id>` cache
 *     invalidation is required per ADR-011 — this suite does not assert
 *     that path).
 *
 * `deleteRecipe` behavior (FR-15):
 *   - `id` does not resolve to any recipe => `{ ok: false, error: { code:
 *     "NOT_FOUND" } }`, no revalidate.
 *   - `id` resolves => deletes the recipe row; its `recipe_line` rows are
 *     gone too (DB-level `ON DELETE CASCADE`, S-201 — the action itself
 *     just deletes the recipe row, per Dev Notes); referenced ingredient
 *     catalog rows AND pantry rows are completely unaffected (FR-15 AC);
 *     calls `revalidatePath("/recipes")`; returns `{ ok: true, data: { id } }`.
 *   - Deleting the same id again (after a successful prior delete)
 *     returns the same `NOT_FOUND` shape.
 * ===========================================================================
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function openRawDb(dbPath: string): Database.Database {
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

interface RawRecipeRow {
  id: number;
  name: string;
  servings: number;
  instructions: string;
}

interface RawLineRow {
  id: number;
  recipeId: number;
  ingredientId: number;
  quantityCanonical: number;
  entryUnitClass: string;
  displayQuantity: number;
  displayUnit: string;
}

function getRawRecipe(dbPath: string, id: number): RawRecipeRow | undefined {
  const sqlite = openRawDb(dbPath);
  try {
    return sqlite.prepare("SELECT * FROM recipe WHERE id = ?").get(id) as RawRecipeRow | undefined;
  } finally {
    sqlite.close();
  }
}

function getRawLines(dbPath: string, recipeId: number): RawLineRow[] {
  const sqlite = openRawDb(dbPath);
  try {
    return sqlite
      .prepare("SELECT * FROM recipe_line WHERE recipeId = ? ORDER BY ingredientId")
      .all(recipeId) as RawLineRow[];
  } finally {
    sqlite.close();
  }
}

describe("app/actions/recipe-actions: updateRecipe / deleteRecipe (S-402)", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalNextRuntime = process.env.NEXT_RUNTIME;

  let chickenId: number;
  let riceId: number;
  let garlicId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-recipe-edit-delete-test-${randomUUID()}-`));
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
    garlicId = insertRawIngredient(setupSqlite, {
      name: "Garlic",
      unitClass: "COUNT",
      caloriesPerRef: 4,
      proteinPerRef: 0.2,
      carbsPerRef: 1,
      fatPerRef: 0,
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

  function mention(name: string, id: number, quantity: number, unit: string): string {
    return `@${name}(${id}){${quantity}%${unit}}`;
  }

  /** Seeds a baseline recipe: "Chicken and Rice", 4 servings, 2 lines. */
  function seedBaselineRecipe(): number {
    const sqlite = openRawDb(dbPath);
    const recipeId = insertRawRecipe(sqlite, {
      name: "Chicken and Rice",
      servings: 4,
      instructions: `Cook the ${mention("Chicken Breast", chickenId, 400, "g")} with the ${mention("Rice", riceId, 300, "g")}.`,
    });
    insertRawRecipeLine(sqlite, recipeId, chickenId, {
      quantityCanonical: 400,
      entryUnitClass: "MASS",
      displayQuantity: 400,
      displayUnit: "g",
    });
    insertRawRecipeLine(sqlite, recipeId, riceId, {
      quantityCanonical: 300,
      entryUnitClass: "MASS",
      displayQuantity: 300,
      displayUnit: "g",
    });
    sqlite.close();
    return recipeId;
  }

  function validUpdateInput(overrides: Record<string, unknown> = {}) {
    return {
      name: "Chicken and Rice",
      servings: 4,
      body: `Cook the ${mention("Chicken Breast", chickenId, 400, "g")} with the ${mention("Rice", riceId, 300, "g")}.`,
      ...overrides,
    };
  }

  describe("updateRecipe", () => {
    describe("valid edit — metadata + full line replacement (FR-14 AC1/AC2)", () => {
      it("returns ok:true with the updated metadata and recomputed lines", async () => {
        const recipeId = seedBaselineRecipe();
        const { updateRecipe } = await import("@/app/actions/recipe-actions");

        const result = await updateRecipe(
          recipeId,
          validUpdateInput({ name: "Chicken and Rice, revised", servings: 6 }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.name).toBe("Chicken and Rice, revised");
        expect(result.data.servings).toBe(6);
        expect(result.data.lines).toHaveLength(2);
      });

      it("persists the new metadata to the database", async () => {
        const recipeId = seedBaselineRecipe();
        const { updateRecipe } = await import("@/app/actions/recipe-actions");

        await updateRecipe(recipeId, validUpdateInput({ name: "Chicken and Rice, revised", servings: 6 }));

        const row = getRawRecipe(dbPath, recipeId);
        expect(row?.name).toBe("Chicken and Rice, revised");
        expect(row?.servings).toBe(6);
      });

      it("changing a line's quantity/unit recomputes quantityCanonical + entryUnitClass and stores the new display values verbatim (FR-9)", async () => {
        const recipeId = seedBaselineRecipe();
        const { updateRecipe } = await import("@/app/actions/recipe-actions");

        // Rice moves from 300 g to 2 cup — cross-unit-class edit (AC5-style
        // permissiveness carried over from create), must recompute canonical.
        const result = await updateRecipe(
          recipeId,
          validUpdateInput({
            body: `Cook the ${mention("Chicken Breast", chickenId, 400, "g")} with ${mention("Rice", riceId, 2, "cup")}.`,
          }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const riceLine = result.data.lines.find((line: { ingredientId: number }) => line.ingredientId === riceId)!;
        expect(riceLine.displayQuantity).toBe(2);
        expect(riceLine.displayUnit).toBe("cup");
        expect(riceLine.entryUnitClass).toBe("VOLUME");
        expect(riceLine.quantityCanonical).toBe(toCanonical(2, "cup").quantityCanonical);
      });

      it("replaces the line set atomically — adding a new line and removing an existing one in the same update", async () => {
        const recipeId = seedBaselineRecipe();
        const { updateRecipe } = await import("@/app/actions/recipe-actions");

        // Drop rice, keep chicken, add garlic.
        const result = await updateRecipe(
          recipeId,
          validUpdateInput({
            body: `Cook the ${mention("Chicken Breast", chickenId, 400, "g")} with ${mention("Garlic", garlicId, 3, "each")}.`,
          }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.lines).toHaveLength(2);
        const ingredientIds = result.data.lines
          .map((line: { ingredientId: number }) => line.ingredientId)
          .sort((a: number, b: number) => a - b);
        expect(ingredientIds).toEqual([chickenId, garlicId].sort((a, b) => a - b));

        const rows = getRawLines(dbPath, recipeId);
        expect(rows).toHaveLength(2);
        expect(rows.some((row) => row.ingredientId === riceId)).toBe(false);
      });

      it("does not leave stale/duplicate line rows behind — the recipe_line count for this recipe matches the new input exactly", async () => {
        const recipeId = seedBaselineRecipe();
        const { updateRecipe } = await import("@/app/actions/recipe-actions");

        await updateRecipe(
          recipeId,
          validUpdateInput({
            body: mention("Chicken Breast", chickenId, 400, "g"),
          }),
        );

        const rows = getRawLines(dbPath, recipeId);
        expect(rows).toHaveLength(1);
        expect(rows[0].ingredientId).toBe(chickenId);
      });

      it("revalidates /recipes on a successful update", async () => {
        const recipeId = seedBaselineRecipe();
        const { updateRecipe } = await import("@/app/actions/recipe-actions");
        const { revalidatePath } = await import("next/cache");

        const result = await updateRecipe(recipeId, validUpdateInput());

        expect(result.ok).toBe(true);
        expect(revalidatePath).toHaveBeenCalledWith("/recipes");
      });
    });

    describe("edit to 0 parsed mentions is rejected — FR-13's >=1-line invariant holds on edit too (AC3)", () => {
      it("returns ok:false with a fieldErrors.body entry and leaves the recipe + its lines completely untouched", async () => {
        const recipeId = seedBaselineRecipe();
        const beforeRow = getRawRecipe(dbPath, recipeId);
        const beforeLines = getRawLines(dbPath, recipeId);

        const { updateRecipe } = await import("@/app/actions/recipe-actions");
        const { revalidatePath } = await import("next/cache");

        const result = await updateRecipe(recipeId, validUpdateInput({ body: "Just eat it plain." }));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.fieldErrors?.body).toBeDefined();
        expect(revalidatePath).not.toHaveBeenCalled();

        expect(getRawRecipe(dbPath, recipeId)).toEqual(beforeRow);
        expect(getRawLines(dbPath, recipeId)).toEqual(beforeLines);
      });
    });

    describe("other validation failures leave the target recipe untouched (FR-13 AC3)", () => {
      it.each([0, -1, 2.5])(
        "returns ok:false for servings=%s and leaves the stored recipe unchanged",
        async (servings) => {
          const recipeId = seedBaselineRecipe();
          const beforeRow = getRawRecipe(dbPath, recipeId);

          const { updateRecipe } = await import("@/app/actions/recipe-actions");

          const result = await updateRecipe(recipeId, validUpdateInput({ servings }));

          expect(result.ok).toBe(false);
          if (result.ok) return;
          expect(result.error.fieldErrors?.servings).toBeDefined();
          expect(getRawRecipe(dbPath, recipeId)).toEqual(beforeRow);
        },
      );

      it("returns ok:false when a mention has no {quantity} block, leaving stored lines unchanged", async () => {
        const recipeId = seedBaselineRecipe();
        const beforeLines = getRawLines(dbPath, recipeId);

        const { updateRecipe } = await import("@/app/actions/recipe-actions");

        const result = await updateRecipe(recipeId, {
          ...validUpdateInput(),
          body: `Add @Chicken Breast(${chickenId}) to taste.`,
        });

        expect(result.ok).toBe(false);
        expect(getRawLines(dbPath, recipeId)).toEqual(beforeLines);
      });

      it("returns ok:false when a mention's quantity is 0, leaving stored lines unchanged", async () => {
        const recipeId = seedBaselineRecipe();
        const beforeLines = getRawLines(dbPath, recipeId);

        const { updateRecipe } = await import("@/app/actions/recipe-actions");

        const result = await updateRecipe(recipeId, {
          ...validUpdateInput(),
          body: mention("Chicken Breast", chickenId, 0, "g"),
        });

        expect(result.ok).toBe(false);
        expect(getRawLines(dbPath, recipeId)).toEqual(beforeLines);
      });
    });

    describe("an ingredientId that doesn't exist — clean error, no partial state (architecture.md §6)", () => {
      it("returns ok:false rather than throwing, leaving the recipe's PRE-EXISTING metadata and lines exactly as they were", async () => {
        const recipeId = seedBaselineRecipe();
        const beforeRow = getRawRecipe(dbPath, recipeId);
        const beforeLines = getRawLines(dbPath, recipeId);

        const { updateRecipe } = await import("@/app/actions/recipe-actions");

        // If updateRecipe lets the underlying FK exception propagate
        // instead of catching it, this `await` itself throws and fails the
        // test — that failure IS the assertion that it must be caught
        // cleanly (mirrors tests/integration/recipe-actions.test.ts's
        // createRecipe equivalent).
        const result = await updateRecipe(
          recipeId,
          validUpdateInput({
            name: "Attempted Overwrite",
            servings: 99,
            body: mention("Ghost Ingredient", 999_999, 10, "g"),
          }),
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(typeof result.error.message).toBe("string");
        expect(result.error.message.length).toBeGreaterThan(0);

        // Transactional: the failed replace must not have partially
        // applied the metadata change or dropped the old lines.
        expect(getRawRecipe(dbPath, recipeId)).toEqual(beforeRow);
        expect(getRawLines(dbPath, recipeId)).toEqual(beforeLines);
      });
    });

    describe("nonexistent recipe id", () => {
      it("returns ok:false with error.code NOT_FOUND, writes nothing, and does not revalidate", async () => {
        const recipeId = seedBaselineRecipe();
        const totalRecipesBefore = countRows(openRawDb(dbPath), "recipe");

        const { updateRecipe } = await import("@/app/actions/recipe-actions");
        const { revalidatePath } = await import("next/cache");

        const result = await updateRecipe(recipeId + 999_999, validUpdateInput());

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe("NOT_FOUND");
        expect(revalidatePath).not.toHaveBeenCalled();

        const raw = openRawDb(dbPath);
        expect(countRows(raw, "recipe")).toBe(totalRecipesBefore);
        raw.close();
      });
    });
  });

  describe("deleteRecipe", () => {
    describe("an existing recipe (FR-15)", () => {
      it("deletes the recipe row and returns ok:true with its id", async () => {
        const recipeId = seedBaselineRecipe();
        const { deleteRecipe } = await import("@/app/actions/recipe-actions");

        const result = await deleteRecipe(recipeId);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.data.id).toBe(recipeId);
        expect(getRawRecipe(dbPath, recipeId)).toBeUndefined();
      });

      it("cascades — its recipe_line rows are gone too (DB-level ON DELETE CASCADE)", async () => {
        const recipeId = seedBaselineRecipe();
        expect(getRawLines(dbPath, recipeId)).toHaveLength(2);

        const { deleteRecipe } = await import("@/app/actions/recipe-actions");
        await deleteRecipe(recipeId);

        expect(getRawLines(dbPath, recipeId)).toHaveLength(0);
      });

      it("leaves the referenced ingredient catalog rows completely untouched (FR-15 AC)", async () => {
        const recipeId = seedBaselineRecipe();
        const { deleteRecipe } = await import("@/app/actions/recipe-actions");

        await deleteRecipe(recipeId);

        const raw = openRawDb(dbPath);
        const chickenRow = raw.prepare("SELECT * FROM ingredient WHERE id = ?").get(chickenId);
        const riceRow = raw.prepare("SELECT * FROM ingredient WHERE id = ?").get(riceId);
        raw.close();
        expect(chickenRow).toBeDefined();
        expect(riceRow).toBeDefined();
      });

      it("leaves pantry rows for the recipe's ingredients completely untouched (FR-15 AC)", async () => {
        const recipeId = seedBaselineRecipe();
        const setupSqlite = openRawDb(dbPath);
        insertRawPantryItem(setupSqlite, chickenId, { displayQuantity: 250, displayUnit: "g" });
        setupSqlite.close();

        const { deleteRecipe } = await import("@/app/actions/recipe-actions");
        await deleteRecipe(recipeId);

        const raw = openRawDb(dbPath);
        const pantryRow = raw.prepare("SELECT * FROM pantry_item WHERE ingredientId = ?").get(chickenId);
        raw.close();
        expect(pantryRow).toBeDefined();
      });

      it("revalidates /recipes on a successful delete", async () => {
        const recipeId = seedBaselineRecipe();
        const { deleteRecipe } = await import("@/app/actions/recipe-actions");
        const { revalidatePath } = await import("next/cache");

        const result = await deleteRecipe(recipeId);

        expect(result.ok).toBe(true);
        expect(revalidatePath).toHaveBeenCalledWith("/recipes");
      });
    });

    describe("nonexistent id", () => {
      it("returns ok:false with error.code NOT_FOUND and does not revalidate", async () => {
        const { deleteRecipe } = await import("@/app/actions/recipe-actions");
        const { revalidatePath } = await import("next/cache");

        const result = await deleteRecipe(999_999);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.code).toBe("NOT_FOUND");
        expect(revalidatePath).not.toHaveBeenCalled();
      });
    });

    describe("deleting the same recipe twice", () => {
      it("the second delete (after a successful first) returns the same NOT_FOUND shape", async () => {
        const recipeId = seedBaselineRecipe();
        const { deleteRecipe } = await import("@/app/actions/recipe-actions");

        const first = await deleteRecipe(recipeId);
        expect(first.ok).toBe(true);

        const second = await deleteRecipe(recipeId);
        expect(second.ok).toBe(false);
        if (second.ok) return;
        expect(second.error.code).toBe("NOT_FOUND");
      });
    });
  });
});
