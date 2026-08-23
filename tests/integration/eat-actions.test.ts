import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient, insertRawPantryItem } from "./support/rawFixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * openspec: pantry-quick-eat — eatPantryItem against a MOCKED service:
 * direct-consumable meal logging, directlyLoggable flip on existing
 * mirrors, pantry consumption, today's eat_item plan entry, and the
 * all-or-nothing guarantee when the service is down.
 */
const serviceMock = {
  ingredients: [] as Array<Record<string, unknown> & { id: number; name: string; directlyLoggable?: boolean }>,
  meals: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ id: number; body: Record<string, unknown> }>,
  failAll: false,
  failMeals: false,
  nextId: 1000,
};

vi.mock("@/services/dionysusService", () => ({
  DionysusServiceError: class DionysusServiceError extends Error {},
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
    serviceMock.updates.push({ id, body });
    const index = serviceMock.ingredients.findIndex((item) => item.id === id);
    if (index >= 0) serviceMock.ingredients[index] = { ...serviceMock.ingredients[index], ...body, id };
    return serviceMock.ingredients[index];
  }),
  createMeal: vi.fn(async (_baseUrl: string, input: Record<string, unknown>) => {
    if (serviceMock.failAll || serviceMock.failMeals) throw new Error("meal endpoint down");
    const created = { ...input, id: serviceMock.nextId++ };
    serviceMock.meals.push(created);
    return created;
  }),
}));

describe("eatPantryItem", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalServiceUrl = process.env.DIONYSUS_SERVICE_URL;

  let beerId: number;
  let beerRowId: number;
  let flourId: number;
  let flourRowId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-eat-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.DIONYSUS_SERVICE_URL = "http://service.test";
    vi.resetModules();
    serviceMock.ingredients = [];
    serviceMock.meals = [];
    serviceMock.updates = [];
    serviceMock.failAll = false;
    serviceMock.failMeals = false;

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    // Ready-to-eat VOLUME beer, packaged 355 mL; 710 mL (2 cans) stocked.
    beerId = insertRawIngredient(sqlite, {
      name: "Eat Test Beer",
      unitClass: "VOLUME",
      caloriesPerRef: 43,
      packageQuantity: 355,
      packageUnit: "mL",
      readyToEat: true,
    });
    beerRowId = insertRawPantryItem(sqlite, beerId, {
      quantityCanonical: 710,
      entryUnitClass: "VOLUME",
      displayQuantity: 710,
      displayUnit: "mL",
    });
    // NOT ready to eat — the guard case.
    flourId = insertRawIngredient(sqlite, { name: "Eat Test Flour", unitClass: "MASS", caloriesPerRef: 364 });
    flourRowId = insertRawPantryItem(sqlite, flourId, {
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
    if (originalServiceUrl === undefined) delete process.env.DIONYSUS_SERVICE_URL;
    else process.env.DIONYSUS_SERVICE_URL = originalServiceUrl;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  function beerQuantity(): number {
    const sqlite = new Database(dbPath);
    const row = sqlite.prepare("SELECT quantityCanonical FROM pantry_item WHERE id = ?").get(beerRowId) as {
      quantityCanonical: number;
    };
    sqlite.close();
    return row.quantityCanonical;
  }

  function planEntries(): Array<{ kind: string; batchLabel: string | null; portions: number }> {
    const sqlite = new Database(dbPath);
    const rows = sqlite.prepare("SELECT kind, batchLabel, portions FROM plan_entry").all() as Array<{
      kind: string;
      batchLabel: string | null;
      portions: number;
    }>;
    sqlite.close();
    return rows;
  }

  it("eating 1 each logs the package volume, consumes the pantry, and plans today", async () => {
    const { eatPantryItem } = await import("@/app/actions/eat-actions");
    const result = await eatPantryItem({ pantryItemId: beerRowId, quantity: 1, unit: "each" });
    expect(result.ok).toBe(true);

    // Service: a directly-loggable mirror plus one direct_consumable meal of a can.
    expect(serviceMock.ingredients).toHaveLength(1);
    expect(serviceMock.ingredients[0]).toMatchObject({ name: "Eat Test Beer", directlyLoggable: true });
    expect(serviceMock.meals).toHaveLength(1);
    expect(serviceMock.meals[0].lines).toEqual([
      {
        lineType: "direct_consumable",
        ingredientId: serviceMock.ingredients[0].id,
        quantity: 355,
        unit: "mL",
      },
    ]);

    expect(beerQuantity()).toBe(355); // 710 - one 355 mL can
    expect(planEntries()).toEqual([{ kind: "eat_item", batchLabel: "Eat Test Beer (1 each)", portions: 1 }]);
  });

  it("an existing non-loggable mirror is flipped, not duplicated", async () => {
    serviceMock.ingredients.push({ id: 500, name: "Eat Test Beer", directlyLoggable: false });
    const { eatPantryItem } = await import("@/app/actions/eat-actions");
    const result = await eatPantryItem({ pantryItemId: beerRowId, quantity: 355, unit: "mL" });
    expect(result.ok).toBe(true);
    expect(serviceMock.ingredients).toHaveLength(1);
    expect(serviceMock.updates).toEqual([{ id: 500, body: expect.objectContaining({ directlyLoggable: true }) }]);
    expect(serviceMock.meals[0].lines).toEqual([
      { lineType: "direct_consumable", ingredientId: 500, quantity: 355, unit: "mL" },
    ]);
  });

  it("a product not marked ready to eat is rejected untouched", async () => {
    const { eatPantryItem } = await import("@/app/actions/eat-actions");
    const result = await eatPantryItem({ pantryItemId: flourRowId, quantity: 100, unit: "g" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(serviceMock.meals).toHaveLength(0);
    expect(planEntries()).toEqual([]);
  });

  // openspec: plan-pantry-backdate
  it("a backdated eat logs the meal at noon UTC of that day and plans that date", async () => {
    const { eatPantryItem } = await import("@/app/actions/eat-actions");
    const result = await eatPantryItem({ pantryItemId: beerRowId, quantity: 1, unit: "each", date: "2026-08-19" });
    expect(result.ok).toBe(true);
    expect(serviceMock.meals[0].eatenAt).toBe("2026-08-19T12:00:00.000Z");
    const sqlite = new Database(dbPath);
    const rows = sqlite.prepare("SELECT date, kind, ingredientId FROM plan_entry").all() as Array<{
      date: string;
      kind: string;
      ingredientId: number | null;
    }>;
    sqlite.close();
    expect(rows).toEqual([{ date: "2026-08-19", kind: "eat_item", ingredientId: beerId }]);
  });

  it("a future date is rejected untouched", async () => {
    const { eatPantryItem } = await import("@/app/actions/eat-actions");
    const result = await eatPantryItem({ pantryItemId: beerRowId, quantity: 1, unit: "each", date: "2199-01-01" });
    expect(result.ok).toBe(false);
    expect(serviceMock.meals).toHaveLength(0);
    expect(beerQuantity()).toBe(710);
  });

    it("a downed service consumes nothing and plans nothing", async () => {
    serviceMock.failAll = true;
    const { eatPantryItem } = await import("@/app/actions/eat-actions");
    const result = await eatPantryItem({ pantryItemId: beerRowId, quantity: 1, unit: "each" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SERVICE_ERROR");
    expect(beerQuantity()).toBe(710);
    expect(planEntries()).toEqual([]);
  });

  it("a failed meal log after the mirror still consumes nothing", async () => {
    serviceMock.failMeals = true;
    const { eatPantryItem } = await import("@/app/actions/eat-actions");
    const result = await eatPantryItem({ pantryItemId: beerRowId, quantity: 1, unit: "each" });
    expect(result.ok).toBe(false);
    expect(beerQuantity()).toBe(710);
    expect(planEntries()).toEqual([]);
  });
});
