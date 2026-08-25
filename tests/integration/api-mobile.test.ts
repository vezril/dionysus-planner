import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient, insertRawPantryItem, insertRawRecipe } from "./support/rawFixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * openspec: mobile-api — the /api/mobile route handlers, called directly
 * as functions (no server) with the service module mocked, same posture
 * as api-ingredients.test.ts.
 */
const serviceMock = {
  ingredients: [] as Array<Record<string, unknown> & { id: number; name: string }>,
  meals: [] as Array<Record<string, unknown>>,
  fail: false,
  nextId: 500,
};

vi.mock("@/services/dionysusService", () => ({
  DionysusServiceError: class DionysusServiceError extends Error {},
  listIngredients: vi.fn(async () => {
    if (serviceMock.fail) throw new Error("down");
    return serviceMock.ingredients;
  }),
  createIngredient: vi.fn(async (_baseUrl: string, input: Record<string, unknown>) => {
    if (serviceMock.fail) throw new Error("down");
    const created = { ...input, id: serviceMock.nextId++ } as (typeof serviceMock.ingredients)[number];
    serviceMock.ingredients.push(created);
    return created;
  }),
  updateIngredient: vi.fn(async () => ({})),
  createMeal: vi.fn(async (_baseUrl: string, input: Record<string, unknown>) => {
    if (serviceMock.fail) throw new Error("down");
    const created = { ...input, id: serviceMock.nextId++ };
    serviceMock.meals.push(created);
    return created;
  }),
  listBatches: vi.fn(async () => [{ id: 42, recipeId: 7, cookedAt: "2026-08-20T12:00:00Z", servingsMade: 4, remainingPortions: 3 }]),
  listRecipes: vi.fn(async () => [{ id: 7, name: "Mobile Chili" }]),
  getDayLog: vi.fn(async () => {
    if (serviceMock.fail) throw new Error("down");
    return { date: "2026-08-21", totalNutrition: { caloriesKcal: 0 }, meals: [] };
  }),
  getLogRange: vi.fn(async () => {
    if (serviceMock.fail) throw new Error("down");
    return { days: [] };
  }),
}));

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("mobile API", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalServiceUrl = process.env.DIONYSUS_SERVICE_URL;

  let beerId: number;
  let beerRowId: number;
  let recipeId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-mobile-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.DIONYSUS_SERVICE_URL = "http://service.test";
    vi.resetModules();
    serviceMock.ingredients = [];
    serviceMock.meals = [];
    serviceMock.fail = false;

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    beerId = insertRawIngredient(sqlite, {
      name: "Mobile Beer",
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
    recipeId = insertRawRecipe(sqlite, { name: "Mobile Bread", servings: 2 });
    sqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalServiceUrl === undefined) delete process.env.DIONYSUS_SERVICE_URL;
    else process.env.DIONYSUS_SERVICE_URL = originalServiceUrl;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("GET pantry returns rows with readyToEat and category", async () => {
    const { GET } = await import("@/app/api/mobile/pantry/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const rows = (await response.json()) as Array<Record<string, unknown>>;
    const beer = rows.find((row) => row.ingredientName === "Mobile Beer")!;
    expect(beer).toMatchObject({ readyToEat: true, category: "FOOD", displayQuantity: 710 });
  });

  it("scanner flow: unknown barcode 404s, POST creates, lookup then finds it", async () => {
    const { GET, POST } = await import("@/app/api/mobile/products/route");
    const miss = await GET(new Request("http://x/api/mobile/products?barcode=0123456789012"));
    expect(miss.status).toBe(404);

    const created = await POST(
      jsonRequest("http://x/api/mobile/products", "POST", {
        name: "Scanned Cola",
        unitClass: "VOLUME",
        category: "DRINK",
        barcode: "0123456789012",
        nutritionBasisQuantity: 100,
        nutritionBasisUnit: "mL",
        caloriesPerRef: 42,
        proteinPerRef: 0,
        carbsPerRef: 11,
        fatPerRef: 0,
        readyToEat: true,
        initialQuantity: 355,
        unit: "mL",
      }),
    );
    expect(created.status).toBe(201);

    const hit = await GET(new Request("http://x/api/mobile/products?barcode=0123456789012"));
    expect(hit.status).toBe(200);
    expect(((await hit.json()) as { name: string }).name).toBe("Scanned Cola");
  });

  it("POST eat consumes the pantry through the same all-or-nothing action", async () => {
    const { POST } = await import("@/app/api/mobile/eat/route");
    const response = await POST(
      jsonRequest("http://x/api/mobile/eat", "POST", { pantryItemId: beerRowId, quantity: 1, unit: "each" }),
    );
    expect(response.status).toBe(200);
    expect(serviceMock.meals).toHaveLength(1);

    serviceMock.fail = true;
    const down = await POST(
      jsonRequest("http://x/api/mobile/eat", "POST", { pantryItemId: beerRowId, quantity: 1, unit: "each" }),
    );
    expect(down.status).toBe(502);
  });

  it("planner week round-trips an entry add and delete", async () => {
    const plannerRoute = await import("@/app/api/mobile/planner/route");
    const entriesRoute = await import("@/app/api/mobile/planner-entries/route");

    const added = await entriesRoute.POST(
      jsonRequest("http://x/api/mobile/planner-entries", "POST", {
        date: "2026-08-19",
        recipeId,
        portions: 1,
      }),
    );
    expect(added.status).toBe(201);
    const entry = (await added.json()) as { id: number };

    const week = await plannerRoute.GET(new Request("http://x/api/mobile/planner?weekStart=2026-08-17"));
    expect(week.status).toBe(200);
    const weekBody = (await week.json()) as { entriesByDate: Record<string, Array<{ id: number }>> };
    expect(weekBody.entriesByDate["2026-08-19"].some((row) => row.id === entry.id)).toBe(true);

    const removed = await entriesRoute.DELETE(
      new Request(`http://x/api/mobile/planner-entries?id=${entry.id}`, { method: "DELETE" }),
    );
    expect(removed.status).toBe(204);
  });

  // openspec: subrecipes-consume-qol — one-tap portion log lands on
  // today's plan too.
  it("POST log-portion logs the meal AND records today's eat_item plan entry", async () => {
    const { POST } = await import("@/app/api/mobile/log-portion/route");
    const response = await POST(jsonRequest("http://x/api/mobile/log-portion", "POST", { batchId: 42 }));
    expect(response.status).toBe(200);
    expect(serviceMock.meals).toHaveLength(1);
    const sqlite = new Database(dbPath);
    const rows = sqlite.prepare("SELECT kind, batchLabel, portions FROM plan_entry").all() as Array<{
      kind: string;
      batchLabel: string;
      portions: number;
    }>;
    sqlite.close();
    expect(rows).toEqual([{ kind: "eat_item", batchLabel: "Mobile Chili", portions: 1 }]);
  });

    it("log-range validates its dates", async () => {
    const { GET } = await import("@/app/api/mobile/log-range/route");
    expect((await GET(new Request("http://x/api/mobile/log-range"))).status).toBe(400);
    expect((await GET(new Request("http://x/api/mobile/log-range?from=2026-08-01&to=2026-08-21"))).status).toBe(200);
  });
});
