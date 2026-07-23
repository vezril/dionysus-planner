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
 * Traces to docs/stories/S-401-recipe-create.md, architecture.md §4
 * Recipe/RecipeLine, §6 error-handling union, ADR-005, FR-13, FR-9.
 *
 * openspec: cooklang-recipe-editor — the INPUT shape changed from a
 * structured `lines: [...]` array to a single `body: string` (the typed
 * recipe with inline `@Name(id){quantity%unit}` mentions). `createRecipe`
 * now calls `domain/cooklangParser.ts#parseRecipeBody(body)` to derive the
 * same `{ingredientId, quantity, unit}` lines this suite already pinned —
 * the OUTPUT contract (result.data.lines, the transactional write, the
 * FK-catch behavior) is unchanged; only how those lines are produced from
 * the caller's input has changed. `instructions` is stored verbatim as the
 * raw typed `body` text (no separate free-text field anymore).
 *
 * `next/cache`'s `revalidatePath` throws when invoked outside an active
 * Next.js request/action scope — mocked here as a harness concern only.
 *
 * ============================ PINNED CONTRACT ============================
 * export async function createRecipe(input: unknown): Promise<CreateRecipeResult>
 *
 * type CreateRecipeResult =
 *   | { ok: true; data: RecipeRecord & { lines: RecipeLineRecord[] } }
 *   | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[]> } }
 *
 * `input` (pre-validation, matches `domain/validation/recipe.schema.ts`'s
 * `recipeSchema`):
 *   { name: string; servings: number; body: string; tags?: string[] }
 *
 * Behavior:
 *   - Re-parses `input` with `recipeSchema` (name/servings/body shape) —
 *     never trusts the caller (ADR-005).
 *   - Parses `body` with `parseRecipeBody`; zero mentions or any parse
 *     error (missing quantity, unknown unit) returns `{ ok: false, error:
 *     { fieldErrors: { body: [...] } } }` and writes NOTHING.
 *   - For each parsed line, converts `quantity`/`unit` via
 *     `domain/units.ts#toCanonical` into `quantityCanonical`/
 *     `entryUnitClass`, persisting `quantity`/`unit` verbatim as
 *     `displayQuantity`/`displayUnit` (FR-9).
 *   - `instructions` column stores the raw `body` text verbatim (mentions
 *     and all) — reopening for edit reads it straight back with no
 *     reconstruction (design.md Decision 6).
 *   - Delegates the write to `recipeRepo.createWithLines` — ONE
 *     transaction, recipe + all lines together or neither (S-202).
 *   - A mention's `(id)` that doesn't exist in the `ingredient` table
 *     trips the FK — CAUGHT and mapped to `{ ok: false, error }`, never an
 *     unhandled exception, never a partially written recipe row.
 *   - A mention entered in a unit class other than its ingredient's
 *     primary class (e.g. `cup` of a MASS-primary ingredient) saves
 *     successfully — no cross-class rejection at save time (AC5).
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

  function mention(name: string, id: number, quantity: number, unit: string): string {
    return `@${name}(${id}){${quantity}%${unit}}`;
  }

  const validInput = () => ({
    name: "Chicken and Rice",
    servings: 4,
    body: `Cook the ${mention("Chicken Breast", chickenId, 400, "g")} with the ${mention("Rice", riceId, 300, "g")}.`,
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

    it("persists exactly one recipe row and one row per parsed mention", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      await createRecipe(validInput());

      expect(countInDb("recipe")).toBe(1);
      expect(countInDb("recipe_line")).toBe(2);
    });

    it("stores the raw body text verbatim in the instructions column (design.md Decision 6 — no reconstruction needed on reopen)", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");
      const input = validInput();

      const result = await createRecipe(input);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.instructions).toBe(input.body);
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

    it("saves a mention entered in a unit class other than the ingredient's primary class (AC5 — permissive entry)", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      // Rice is MASS-primary (with density 0.85 g/mL) but entered here in
      // cups (VOLUME) — this must NOT be rejected at save time.
      const result = await createRecipe({
        name: "Rice Bowl",
        servings: 2,
        body: `Add ${mention("Rice", riceId, 1, "cup")} of rice.`,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const line = result.data.lines[0];
      expect(line.displayQuantity).toBe(1);
      expect(line.displayUnit).toBe("cup");
      expect(line.entryUnitClass).toBe("VOLUME");
      expect(line.quantityCanonical).toBe(toCanonical(1, "cup").quantityCanonical);
    });

    it("emits one line per occurrence when the same ingredient is mentioned twice", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe({
        name: "Double Chicken",
        servings: 1,
        body: `Sear ${mention("Chicken Breast", chickenId, 200, "g")}, then add ${mention("Chicken Breast", chickenId, 200, "g")} more.`,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.lines).toHaveLength(2);
      expect(countInDb("recipe_line")).toBe(2);
    });
  });

  describe("0 parsed mentions — blocked, writes nothing (FR-13 AC2)", () => {
    it("returns ok:false with a fieldErrors.body entry and creates no rows", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe({
        name: "Empty Recipe",
        servings: 1,
        body: "Just stand there.",
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.fieldErrors?.body).toBeDefined();
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

  describe("a mention with no quantity block or an unknown unit — rejected, writes nothing (FR-13 AC3)", () => {
    it("returns ok:false when a mention has no {quantity} block at all", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe({
        name: "Broken",
        servings: 1,
        body: `Add @Chicken Breast(${chickenId}) to taste.`,
      });

      expect(result.ok).toBe(false);
      expect(countInDb("recipe")).toBe(0);
    });

    it("returns ok:false when a mention's unit is unknown", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      const result = await createRecipe({
        name: "Broken",
        servings: 1,
        body: mention("Chicken Breast", chickenId, 400, "banana-bunches"),
      });

      expect(result.ok).toBe(false);
      expect(countInDb("recipe")).toBe(0);
    });
  });

  describe("a mention referencing a nonexistent ingredient id — a clean error, not a raw DB exception (architecture.md §6)", () => {
    it("returns ok:false rather than throwing, and writes nothing", async () => {
      const { createRecipe } = await import("@/app/actions/recipe-actions");

      // If createRecipe lets the underlying FK exception propagate instead
      // of catching it, this `await` itself throws and fails the test —
      // that failure IS the assertion that it must be caught cleanly.
      const result = await createRecipe({
        name: "Broken Recipe",
        servings: 1,
        body: mention("Ghost Ingredient", 999_999, 10, "g"),
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
