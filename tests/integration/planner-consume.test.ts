import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDionysusTimezone, todayIsoDateIn } from "@/app/lib/dionysusTimezone";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient, insertRawPantryItem } from "./support/rawFixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * openspec: planner-consume — consumePlanEntry against a MOCKED service:
 * entry-date eatenAt (noon UTC when backdated), FIFO batch drain across
 * the recipe's batches, package-sized pantry portions, the consumedAt
 * flip, and the all-or-nothing guarantee. Plus the availability math:
 * unconsumed plans reserve across weeks; consumed plans stop reserving.
 */
const serviceMock = {
  batches: [] as Array<{ id: number; recipeId: number; cookedAt: string; servingsMade: number; remainingPortions: number }>,
  recipes: [] as Array<{ id: number; name: string; perServingNutrition?: { caloriesKcal: number } }>,
  ingredients: [] as Array<Record<string, unknown> & { id: number; name: string; directlyLoggable?: boolean }>,
  meals: [] as Array<{ eatenAt: string; lines: Array<Record<string, unknown>> }>,
  failAll: false,
  nextId: 1000,
};

vi.mock("@/services/dionysusService", () => ({
  DionysusServiceError: class DionysusServiceError extends Error {},
  listBatches: vi.fn(async () => {
    if (serviceMock.failAll) throw new Error("service unreachable");
    return serviceMock.batches;
  }),
  listRecipes: vi.fn(async () => {
    if (serviceMock.failAll) throw new Error("service unreachable");
    return serviceMock.recipes;
  }),
  listIngredients: vi.fn(async () => {
    if (serviceMock.failAll) throw new Error("service unreachable");
    return serviceMock.ingredients;
  }),
  createIngredient: vi.fn(async (_baseUrl: string, input: Record<string, unknown>) => {
    if (serviceMock.failAll) throw new Error("service unreachable");
    const created = { ...input, id: serviceMock.nextId++ } as (typeof serviceMock.ingredients)[number];
    serviceMock.ingredients.push(created);
    return created;
  }),
  updateIngredient: vi.fn(async (_baseUrl: string, id: number, body: Record<string, unknown>) => {
    if (serviceMock.failAll) throw new Error("service unreachable");
    const index = serviceMock.ingredients.findIndex((item) => item.id === id);
    if (index >= 0) serviceMock.ingredients[index] = { ...serviceMock.ingredients[index], ...body, id };
    return serviceMock.ingredients[index];
  }),
  createMeal: vi.fn(async (_baseUrl: string, input: { eatenAt: string; lines: Array<Record<string, unknown>> }) => {
    if (serviceMock.failAll) throw new Error("meal endpoint down");
    serviceMock.meals.push(input);
    return { ...input, id: serviceMock.nextId++ };
  }),
}));

function insertRawPlanEntry(
  sqlite: Database.Database,
  input: {
    date: string;
    kind: string;
    recipeId?: number | null;
    batchId?: number | null;
    ingredientId?: number | null;
    batchLabel?: string | null;
    portions?: number;
    consumedAt?: string | null;
  },
): number {
  const info = sqlite
    .prepare(
      `INSERT INTO plan_entry (date, kind, recipeId, batchId, ingredientId, batchLabel, portions, createdAt, consumedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.date,
      input.kind,
      input.recipeId ?? null,
      input.batchId ?? null,
      input.ingredientId ?? null,
      input.batchLabel ?? null,
      input.portions ?? 1,
      "2026-01-01T00:00:00.000Z",
      input.consumedAt ?? null,
    );
  return Number(info.lastInsertRowid);
}

function getConsumedAt(dbPath: string, id: number): string | null {
  const sqlite = new Database(dbPath);
  try {
    const row = sqlite.prepare("SELECT consumedAt FROM plan_entry WHERE id = ?").get(id) as
      | { consumedAt: string | null }
      | undefined;
    return row?.consumedAt ?? null;
  } finally {
    sqlite.close();
  }
}

describe("consumePlanEntry", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalServiceUrl = process.env.DIONYSUS_SERVICE_URL;
  const today = todayIsoDateIn(resolveDionysusTimezone());
  const pastDate = "2026-01-15";
  const futureDate = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);

  let beerId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-planconsume-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.DIONYSUS_SERVICE_URL = "http://service.test";
    vi.resetModules();
    serviceMock.failAll = false;
    serviceMock.meals = [];
    serviceMock.ingredients = [];
    serviceMock.recipes = [{ id: 1, name: "Cajun Chicken" }];
    // Two batches of the same recipe: FIFO drains #10 before #11.
    serviceMock.batches = [
      { id: 10, recipeId: 1, cookedAt: "2026-01-10T12:00:00Z", servingsMade: 4, remainingPortions: 1.5 },
      { id: 11, recipeId: 1, cookedAt: "2026-01-12T12:00:00Z", servingsMade: 4, remainingPortions: 2 },
    ];

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    beerId = insertRawIngredient(sqlite, {
      name: "PC Test Beer",
      unitClass: "VOLUME",
      caloriesPerRef: 43,
      readyToEat: true,
      category: "DRINK",
      packageQuantity: 355,
      packageUnit: "mL",
    });
    insertRawPantryItem(sqlite, beerId, {
      quantityCanonical: 1065,
      entryUnitClass: "VOLUME",
      displayQuantity: 1065,
      displayUnit: "mL",
    });
    sqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalServiceUrl === undefined) delete process.env.DIONYSUS_SERVICE_URL;
    else process.env.DIONYSUS_SERVICE_URL = originalServiceUrl;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("consumes a backdated batch entry FIFO across the recipe's batches", async () => {
    const sqlite = new Database(dbPath);
    const entryId = insertRawPlanEntry(sqlite, {
      date: pastDate,
      kind: "eat_batch",
      batchId: 11, // snapshotted the NEWER batch — FIFO must still drain #10 first
      batchLabel: "Cajun Chicken",
      portions: 2,
    });
    sqlite.close();

    const { consumePlanEntry } = await import("@/app/actions/planner-actions");
    const result = await consumePlanEntry(entryId);
    expect(result.ok).toBe(true);
    expect(serviceMock.meals).toHaveLength(1);
    expect(serviceMock.meals[0].eatenAt).toBe(`${pastDate}T12:00:00.000Z`);
    expect(serviceMock.meals[0].lines).toEqual([
      { lineType: "batch_portion", batchId: 10, portions: 1.5 },
      { lineType: "batch_portion", batchId: 11, portions: 0.5 },
    ]);
    expect(getConsumedAt(dbPath, entryId)).not.toBeNull();
  });

  it("refuses when the recipe's batches can't cover the portions", async () => {
    const sqlite = new Database(dbPath);
    const entryId = insertRawPlanEntry(sqlite, {
      date: pastDate,
      kind: "eat_batch",
      batchId: 10,
      batchLabel: "Cajun Chicken",
      portions: 5,
    });
    sqlite.close();

    const { consumePlanEntry } = await import("@/app/actions/planner-actions");
    const result = await consumePlanEntry(entryId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("3.5 portions");
    expect(serviceMock.meals).toHaveLength(0);
    expect(getConsumedAt(dbPath, entryId)).toBeNull();
  });

  it("refuses future-dated entries and already-consumed entries", async () => {
    const sqlite = new Database(dbPath);
    const futureId = insertRawPlanEntry(sqlite, {
      date: futureDate,
      kind: "eat_batch",
      batchId: 10,
      batchLabel: "Cajun Chicken",
    });
    const doneId = insertRawPlanEntry(sqlite, {
      date: pastDate,
      kind: "eat_batch",
      batchId: 10,
      batchLabel: "Cajun Chicken",
      consumedAt: "2026-01-16T12:00:00.000Z",
    });
    sqlite.close();

    const { consumePlanEntry } = await import("@/app/actions/planner-actions");
    const future = await consumePlanEntry(futureId);
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error.message).toContain("future");
    const done = await consumePlanEntry(doneId);
    expect(done.ok).toBe(false);
    if (!done.ok) expect(done.error.message).toContain("Already logged");
    expect(serviceMock.meals).toHaveLength(0);
  });

  it("consumes a pantry entry at package-sized portions and marks it", async () => {
    const sqlite = new Database(dbPath);
    const entryId = insertRawPlanEntry(sqlite, {
      date: pastDate,
      kind: "eat_pantry",
      ingredientId: beerId,
      batchLabel: "PC Test Beer",
      portions: 2, // 2 × 355 mL cans
    });
    sqlite.close();

    const { consumePlanEntry } = await import("@/app/actions/planner-actions");
    const result = await consumePlanEntry(entryId);
    expect(result.ok).toBe(true);
    expect(serviceMock.meals).toHaveLength(1);
    expect(serviceMock.meals[0].eatenAt).toBe(`${pastDate}T12:00:00.000Z`);
    expect(serviceMock.meals[0].lines[0]).toMatchObject({ lineType: "direct_consumable", quantity: 710 });
    expect(getConsumedAt(dbPath, entryId)).not.toBeNull();

    const sqlite2 = new Database(dbPath);
    const row = sqlite2.prepare("SELECT quantityCanonical FROM pantry_item WHERE ingredientId = ?").get(beerId) as {
      quantityCanonical: number;
    };
    sqlite2.close();
    expect(row.quantityCanonical).toBe(355);
  });

  it("a downed service leaves the entry unconsumed (all-or-nothing)", async () => {
    const sqlite = new Database(dbPath);
    const entryId = insertRawPlanEntry(sqlite, {
      date: pastDate,
      kind: "eat_batch",
      batchId: 10,
      batchLabel: "Cajun Chicken",
      portions: 1,
    });
    sqlite.close();
    serviceMock.failAll = true;

    const { consumePlanEntry } = await import("@/app/actions/planner-actions");
    const result = await consumePlanEntry(entryId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SERVICE_ERROR");
    expect(getConsumedAt(dbPath, entryId)).toBeNull();
  });

  it("cook entries are not consumable here", async () => {
    const sqlite = new Database(dbPath);
    const entryId = insertRawPlanEntry(sqlite, { date: pastDate, kind: "cook", recipeId: null });
    sqlite.close();

    const { consumePlanEntry } = await import("@/app/actions/planner-actions");
    const result = await consumePlanEntry(entryId);
    expect(result.ok).toBe(false);
  });
});

describe("planner availability with reservations", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalServiceUrl = process.env.DIONYSUS_SERVICE_URL;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-planavail-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.DIONYSUS_SERVICE_URL = "http://service.test";
    vi.resetModules();
    serviceMock.failAll = false;
    serviceMock.meals = [];
    serviceMock.recipes = [{ id: 1, name: "Cajun Chicken" }];
    serviceMock.batches = [{ id: 10, recipeId: 1, cookedAt: "2026-01-10T12:00:00Z", servingsMade: 4, remainingPortions: 4 }];

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    sqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalServiceUrl === undefined) delete process.env.DIONYSUS_SERVICE_URL;
    else process.env.DIONYSUS_SERVICE_URL = originalServiceUrl;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("unconsumed plans on OTHER weeks still reserve; consumed ones stop", async () => {
    const sqlite = new Database(dbPath);
    // A plan far outside the rendered week reserves 1 of the 4 portions…
    const farId = insertRawPlanEntry(sqlite, {
      date: "2026-03-02",
      kind: "eat_batch",
      batchId: 10,
      batchLabel: "Cajun Chicken",
      portions: 1,
    });
    // …and a consumed plan reserves nothing (the service already counted it).
    insertRawPlanEntry(sqlite, {
      date: "2026-01-05",
      kind: "eat_batch",
      batchId: 10,
      batchLabel: "Cajun Chicken",
      portions: 2,
      consumedAt: "2026-01-05T18:00:00.000Z",
    });
    sqlite.close();

    const { getPlannerWeek } = await import("@/data/planner");
    const week = await getPlannerWeek("2026-01-12", 0.75);
    expect(week.readyToEat).toEqual([
      { batchId: 10, label: "Cajun Chicken", availablePortions: 3, plannedPortions: 1 },
    ]);

    const { removePlanEntryRecord } = await import("@/data/planner");
    await removePlanEntryRecord(farId);
    const after = await getPlannerWeek("2026-01-12", 0.75);
    expect(after.readyToEat[0]).toMatchObject({ availablePortions: 4, plannedPortions: 0 });
  });

  // openspec: nutrition-intake — eat_pantry entries price a ladder-sized
  // portion so the day's calorie chip can total them.
  it("eat_pantry entries carry portion-ladder calories", async () => {
    const sqlite = new Database(dbPath);
    const beerId = insertRawIngredient(sqlite, {
      name: "PA Kcal Beer",
      unitClass: "VOLUME",
      caloriesPerRef: 43,
      readyToEat: true,
      category: "DRINK",
      packageQuantity: 355,
      packageUnit: "mL",
    });
    insertRawPlanEntry(sqlite, {
      date: "2026-01-13",
      kind: "eat_pantry",
      ingredientId: beerId,
      batchLabel: "PA Kcal Beer",
      portions: 2,
    });
    sqlite.close();

    const { getPlannerWeek } = await import("@/data/planner");
    const week = await getPlannerWeek("2026-01-12", 0.75);
    // 43 kcal/100 mL × 355 mL/can × 2 cans = 305.3 → 305.
    expect(week.entriesByDate["2026-01-13"][0].caloriesKcal).toBe(305);
  });
});
