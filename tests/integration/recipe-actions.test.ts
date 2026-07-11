import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { toCanonical } from "@/domain/units";
import { countRows, insertRawIngredient } from "./support/rawFixtures";

/**
 * S-401 recipe creation — `app/actions/recipe-actions.ts#createRecipe`.
 * Traces to docs/stories/S-401-recipe-create.md's TEST task (integration),
 * architecture.md §4 Recipe/RecipeLine, §6 error-handling union, ADR-005
 * (server independently re-validates), FR-13, FR-9.
 *
 * `app/actions/recipe-actions.ts` does not exist yet (only
 * `app/actions/.gitkeep`) — every test below is intentionally RED
 * (module-not-found) until the implementer builds it.
 *
 * `next/cache`'s `revalidatePath` throws when invoked outside an active
 * Next.js request/action scope ("Invariant: static generation store
 * missing") — expected, since ADR-007 calls Server Actions directly here
 * as plain async functions, with no running Next.js server. Mocking it is
 * a test-harness concern only (this suite does not assert anything about
 * *how* or *whether* revalidation is invoked — only about persistence and
 * the returned result shape), not a weakening of the behavior under test.
 *
 * ============================ PINNED CONTRACT ============================
 * export async function createRecipe(input: unknown): Promise<CreateRecipeResult>
 *
 * type CreateRecipeResult =
 *   | { ok: true; data: RecipeRecord & { lines: RecipeLineRecord[] } }
 *   | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } }
 *                                                          // architecture.md §6 discriminated union
 *
 * `input` (pre-validation, matches `domain/validation/recipe.schema.ts`'s
 * `recipeSchema` — the SAME schema the client form uses, ADR-005):
 *   {
 *     name: string;
 *     servings: number;
 *     instructions?: string;
 *     lines: Array<{ ingredientId: number; quantity: number; unit: string }>;
 *   }
 *
 * Behavior:
 *   - Re-parses `input` with `recipeSchema` — never trusts the caller
 *     (ADR-005). A schema violation (incl. 0 lines, FR-13) returns
 *     `{ ok: false, error: { ..., fieldErrors } }` and writes NOTHING —
 *     never a partial recipe row without its lines.
 *   - For each valid line, converts `quantity`/`unit` via
 *     `domain/units.ts#toCanonical` into `quantityCanonical`/
 *     `entryUnitClass`, and persists `quantity`/`unit` verbatim as
 *     `displayQuantity`/`displayUnit` (FR-9 — same pattern as PantryItem).
 *   - Delegates the actual write to `recipeRepo.createWithLines` — ONE
 *     transaction, recipe + all lines together or neither (S-202).
 *   - An `ingredientId` that parses (positive integer) but doesn't exist
 *     in the `ingredient` table trips the FK (`ON DELETE RESTRICT`
 *     doesn't block inserts, but the FK itself still requires the
 *     referenced row to exist) — this must be CAUGHT and mapped to the
 *     same `{ ok: false, error }` shape (architecture.md §6 "FK RESTRICT
 *     violations... caught in the action"), never an unhandled/raw
 *     exception thrown out of `createRecipe`, and never a partially
 *     written recipe row.
 *   - A line entered in a unit class other than its ingredient's primary
 *     class (e.g. `cup` of a MASS-primary ingredient) saves successfully —
 *     no cross-class rejection at save time (AC5; FR-11/FR-12 govern
 *     computation later, not here).
 * ===========================================================================
 */
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("app/actions/recipe-actions#createRecipe", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalNextRuntime = process.env.NEXT_RUNTIME;

  let chickenId: number;
  let riceId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-recipe-actions-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.NEXT_RUNTIME = "nodejs";
    vi.resetModules();

    const setupSqlite = new Database(dbPath);
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
  });

  function countInDb(table: string): number {
    const sqlite = new Database(dbPath);
    try {
      return countRows(sqlite, table);
    } finally {
      sqlite.close();
    }
  }

  const validInput = () => ({
    name: "Chicken and Rice",
    servings: 4,
    instructions: "Cook it.",
    lines: [
      { ingredientId: chickenId, quantity: 400, unit: "g" },
      { ingredientId: riceId, quantity: 300, unit: "g" },
    ],
  });

  describe("valid input — creates the recipe + lines transactionally with canonical AND display values (FR-9)", () => {
    it("returns ok:true with the persisted recipe and its lines", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe(validInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.name).toBe("Chicken and Rice");
      expect(result.data.servings).toBe(4);
      expect(result.data.lines).toHaveLength(2);
    });

    it("persists exactly one recipe row and one row per line", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      await createRecipe(validInput());

      expect(countInDb("recipe")).toBe(1);
      expect(countInDb("recipe_line")).toBe(2);
    });

    it("stores quantityCanonical + entryUnitClass (computed via toCanonical) AND displayQuantity/displayUnit verbatim per line", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe(validInput());

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const chickenLine = result.data.lines.find((line: { ingredientId: number }) => line.ingredientId === chickenId)!;
      expect(chickenLine.displayQuantity).toBe(400);
      expect(chickenLine.displayUnit).toBe("g");
      expect(chickenLine.quantityCanonical).toBe(toCanonical(400, "g").quantityCanonical);
      expect(chickenLine.entryUnitClass).toBe(toCanonical(400, "g").entryUnitClass);
    });

    it("saves a line entered in a unit class other than the ingredient's primary class (AC5 — permissive entry)", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      // Rice is MASS-primary (with density 0.85 g/mL) but entered here in
      // cups (VOLUME) — this must NOT be rejected at save time.
      const result = await createRecipe({
        name: "Rice Bowl",
        servings: 2,
        instructions: "",
        lines: [{ ingredientId: riceId, quantity: 1, unit: "cup" }],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const line = result.data.lines[0];
      expect(line.displayQuantity).toBe(1);
      expect(line.displayUnit).toBe("cup");
      expect(line.entryUnitClass).toBe("VOLUME");
      expect(line.quantityCanonical).toBe(toCanonical(1, "cup").quantityCanonical);
    });
  });

  describe("0 ingredient lines — blocked, writes nothing (FR-13 AC2)", () => {
    it("returns ok:false with a fieldErrors.lines entry and creates no rows", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe({
        name: "Empty Recipe",
        servings: 1,
        instructions: "",
        lines: [],
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.fieldErrors?.lines).toBeDefined();
      expect(countInDb("recipe")).toBe(0);
      expect(countInDb("recipe_line")).toBe(0);
    });
  });

  describe("invalid servings — rejected, writes nothing (FR-13 AC3)", () => {
    it.each([0, -1, 2.5])("returns ok:false for servings=%s and creates no rows", async (servings) => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe({ ...validInput(), servings });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.fieldErrors?.servings).toBeDefined();
      expect(countInDb("recipe")).toBe(0);
    });
  });

  describe("a line with no ingredient or a non-positive quantity — rejected, writes nothing (FR-13 AC3)", () => {
    it("returns ok:false when a line has no ingredientId", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe({
        ...validInput(),
        lines: [{ quantity: 400, unit: "g" }],
      });

      expect(result.ok).toBe(false);
      expect(countInDb("recipe")).toBe(0);
    });

    it("returns ok:false when a line's quantity is 0", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe({
        ...validInput(),
        lines: [{ ingredientId: chickenId, quantity: 0, unit: "g" }],
      });

      expect(result.ok).toBe(false);
      expect(countInDb("recipe")).toBe(0);
    });

    it("returns ok:false when a line's unit is unknown", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe({
        ...validInput(),
        lines: [{ ingredientId: chickenId, quantity: 400, unit: "banana-bunches" }],
      });

      expect(result.ok).toBe(false);
      expect(countInDb("recipe")).toBe(0);
    });
  });

  describe("an ingredientId that doesn't exist — a clean error, not a raw DB exception (architecture.md §6)", () => {
    it("returns ok:false rather than throwing, and writes nothing", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      // If createRecipe lets the underlying FK exception propagate instead
      // of catching it, this `await` itself throws and fails the test —
      // that failure IS the assertion that it must be caught cleanly.
      const result = await createRecipe({
        name: "Broken Recipe",
        servings: 1,
        instructions: "",
        lines: [{ ingredientId: 999_999, quantity: 10, unit: "g" }],
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(typeof result.error.message).toBe("string");
      expect(result.error.message.length).toBeGreaterThan(0);
      expect(countInDb("recipe")).toBe(0);
      expect(countInDb("recipe_line")).toBe(0);
    });
  });
});
