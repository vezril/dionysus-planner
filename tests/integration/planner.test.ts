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

// openspec: planner-ready-to-eat — a tiny in-memory service.
const serviceMock = {
  batches: [] as Array<{ id: number; recipeId: number; cookedAt: string; servingsMade: number; remainingPortions: number }>,
  recipes: [] as Array<{ id: number; name: string; perServingNutrition?: Record<string, unknown> }>,
  fail: false,
};
vi.mock("@/services/dionysusService", () => ({
  DionysusServiceError: class DionysusServiceError extends Error {},
  listBatches: vi.fn(async () => {
    if (serviceMock.fail) throw new Error("service unreachable");
    return serviceMock.batches;
  }),
  listRecipes: vi.fn(async () => {
    if (serviceMock.fail) throw new Error("service unreachable");
    return serviceMock.recipes;
  }),
}));

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
    process.env.DIONYSUS_SERVICE_URL = "http://service.test";
    vi.resetModules();
    serviceMock.batches = [{ id: 7, recipeId: 1, cookedAt: "2026-08-19T12:00:00Z", servingsMade: 4, remainingPortions: 4 }];
    serviceMock.recipes = [{ id: 1, name: "Chili", perServingNutrition: { caloriesKcal: 100, proteinG: 5, carbsG: 10, fatG: 3, sodiumMg: 50, micronutrients: {} } }];
    serviceMock.fail = false;

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
    // openspec: planner-day-click-and-calories — 400 g flour × 40 kcal/100 g.
    expect(week.entriesByDate["2026-08-18"][0]).toMatchObject({ recipeName: "Bread", portions: 1, caloriesKcal: 160 });

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

  it("batch entries round-trip, adjust availability, and never touch the shopping list", async () => {
    const { addPlanEntry } = await import("@/app/actions/planner-actions");
    const { getPlannerWeek } = await import("@/data/planner");

    const added = await addPlanEntry({ kind: "eat_batch", date: "2026-08-19", batchId: 7, portions: 3 });
    expect(added.ok).toBe(true);

    const week = await getPlannerWeek("2026-08-17", 3);
    expect(week.entriesByDate["2026-08-19"][0]).toMatchObject({
      kind: "eat_batch",
      batchLabel: "Chili",
      portions: 3,
      caloriesKcal: 300, // 100 per serving × 3 portions
    });
    expect(week.readyToEat).toEqual([{ batchId: 7, label: "Chili", availablePortions: 1 }]);
    expect(week.shoppingList.items).toEqual([]); // batches consume no pantry
    expect(week.suggestions.find((suggestion) => suggestion.name === "Bread")!.tier).toBe("cookable");
  });

  it("a fully planned batch drops out of ready-to-eat", async () => {
    const { addPlanEntry } = await import("@/app/actions/planner-actions");
    const { getPlannerWeek } = await import("@/data/planner");
    await addPlanEntry({ kind: "eat_batch", date: "2026-08-19", batchId: 7, portions: 4 });
    const week = await getPlannerWeek("2026-08-17", 3);
    expect(week.readyToEat).toEqual([]);
  });

  // openspec: pantry-quick-eat — batches of the same recipe merge into one
  // row; the row carries the oldest batch id so logging drains FIFO.
  it("two batches of one recipe merge into a single summed row targeting the oldest", async () => {
    serviceMock.batches.push({
      id: 8,
      recipeId: 1,
      cookedAt: "2026-08-20T12:00:00Z",
      servingsMade: 4,
      remainingPortions: 4,
    });
    const { getPlannerWeek } = await import("@/data/planner");
    const week = await getPlannerWeek("2026-08-17", 3);
    expect(week.readyToEat).toEqual([{ batchId: 7, label: "Chili", availablePortions: 8 }]);
  });

  it("a drained oldest batch hands the merged row to the next batch", async () => {
    serviceMock.batches.push({
      id: 8,
      recipeId: 1,
      cookedAt: "2026-08-20T12:00:00Z",
      servingsMade: 4,
      remainingPortions: 4,
    });
    const { addPlanEntry } = await import("@/app/actions/planner-actions");
    const { getPlannerWeek } = await import("@/data/planner");
    await addPlanEntry({ kind: "eat_batch", date: "2026-08-19", batchId: 7, portions: 4 });
    const week = await getPlannerWeek("2026-08-17", 3);
    expect(week.readyToEat).toEqual([{ batchId: 8, label: "Chili", availablePortions: 4 }]);
  });

  it("an unknown batch is rejected", async () => {
    const { addPlanEntry } = await import("@/app/actions/planner-actions");
    const result = await addPlanEntry({ kind: "eat_batch", date: "2026-08-19", batchId: 999, portions: 1 });
    expect(result.ok).toBe(false);
  });

  it("a downed service degrades: cook planning intact, empty ready-to-eat", async () => {
    serviceMock.fail = true;
    const { getPlannerWeek } = await import("@/data/planner");
    const week = await getPlannerWeek("2026-08-17", 3);
    expect(week.serviceAvailable).toBe(false);
    expect(week.readyToEat).toEqual([]);
    expect(week.suggestions.length).toBeGreaterThan(0);
  });

  it("an invalid date is rejected", async () => {
    const { addPlanEntry } = await import("@/app/actions/planner-actions");
    const result = await addPlanEntry({ date: "2026-02-31", recipeId: breadId, portions: 1 });
    expect(result.ok).toBe(false);
  });
});
