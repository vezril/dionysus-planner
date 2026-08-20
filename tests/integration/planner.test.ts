import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import {
  insertRawIngredient,
  insertRawPantryItem,
  insertRawRecipe,
  insertRawRecipeLine,
} from "./support/rawFixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * openspec: weekly-planner — persistence + assembly: entries round-trip,
 * recipe deletion cascades plan entries, and the week's suggestions
 * reflect the plan-depleted pantry.
 */
describe("weekly planner", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  let flourId: number;
  let breadId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-planner-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    vi.resetModules();

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    flourId = insertRawIngredient(sqlite, { name: "Flour", unitClass: "MASS" });
    // Bread: 1 serving, 400 g flour. Pantry: 500 g.
    breadId = insertRawRecipe(sqlite, { name: "Bread", servings: 1 });
    insertRawRecipeLine(sqlite, breadId, flourId, {
      quantityCanonical: 400,
      entryUnitClass: "MASS",
      displayQuantity: 400,
      displayUnit: "g",
    });
    insertRawPantryItem(sqlite, flourId, {
      quantityCanonical: 500,
      entryUnitClass: "MASS",
      displayQuantity: 500,
      displayUnit: "g",
    });
    sqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("addPlanEntry persists; the week view lists it; removePlanEntry deletes it", async () => {
    const { addPlanEntry, removePlanEntry } = await import("@/app/actions/planner-actions");
    const { getPlannerWeek } = await import("@/data/planner");

    const added = await addPlanEntry({ date: "2026-08-18", recipeId: breadId, portions: 1 });
    expect(added.ok).toBe(true);

    const week = await getPlannerWeek("2026-08-17", 3);
    expect(week.entriesByDate["2026-08-18"]).toHaveLength(1);
    expect(week.entriesByDate["2026-08-18"][0]).toMatchObject({ recipeName: "Bread", portions: 1 });

    const entryId = added.ok ? added.data.id : -1;
    expect((await removePlanEntry(entryId)).ok).toBe(true);
    const after = await getPlannerWeek("2026-08-17", 3);
    expect(after.entriesByDate["2026-08-18"]).toHaveLength(0);
  });

  it("suggestions deplete: planning Bread consumes the flour headroom", async () => {
    const { addPlanEntry } = await import("@/app/actions/planner-actions");
    const { getPlannerWeek } = await import("@/data/planner");

    const before = await getPlannerWeek("2026-08-17", 3);
    expect(before.suggestions.find((suggestion) => suggestion.name === "Bread")!.tier).toBe("cookable");

    await addPlanEntry({ date: "2026-08-17", recipeId: breadId, portions: 1 });
    const after = await getPlannerWeek("2026-08-17", 3);
    // 500 - 400 = 100 g left; Bread needs 400 → near-match now.
    expect(after.suggestions.find((suggestion) => suggestion.name === "Bread")!.tier).toBe("near");
  });

  it("the week's shopping list collects what the plan can't cover", async () => {
    const { addPlanEntry } = await import("@/app/actions/planner-actions");
    const { getPlannerWeek } = await import("@/data/planner");

    const covered = await getPlannerWeek("2026-08-17", 3);
    expect(covered.shoppingList.items).toEqual([]);

    // Two loaves need 800 g; the pantry holds 500 g → buy 300 g.
    await addPlanEntry({ date: "2026-08-17", recipeId: breadId, portions: 1 });
    await addPlanEntry({ date: "2026-08-19", recipeId: breadId, portions: 1 });
    const week = await getPlannerWeek("2026-08-17", 3);
    expect(week.shoppingList.items).toEqual([
      { ingredientId: flourId, name: "Flour", quantity: 300, unit: "g" },
    ]);
  });

  it("deleting the recipe cascades its plan entries", async () => {
    const { addPlanEntry } = await import("@/app/actions/planner-actions");
    await addPlanEntry({ date: "2026-08-19", recipeId: breadId, portions: 1 });

    const { deleteRecipe } = await import("@/app/actions/recipe-actions");
    const deleted = await deleteRecipe(breadId);
    expect(deleted.ok).toBe(true);

    const sqlite = new Database(dbPath);
    const count = (sqlite.prepare("SELECT COUNT(*) AS n FROM plan_entry").get() as { n: number }).n;
    sqlite.close();
    expect(count).toBe(0);
  });

  it("an invalid date is rejected", async () => {
    const { addPlanEntry } = await import("@/app/actions/planner-actions");
    const result = await addPlanEntry({ date: "2026-02-31", recipeId: breadId, portions: 1 });
    expect(result.ok).toBe(false);
  });
});
