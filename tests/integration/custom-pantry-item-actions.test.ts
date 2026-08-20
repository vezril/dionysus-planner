import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * openspec: custom-pantry-items — `createCustomPantryItem` Server Action.
 *
 * ============================ PINNED CONTRACT ============================
 * export async function createCustomPantryItem(input: unknown):
 *   Promise<{ ok: true; data: { ingredient, item } } | { ok: false; error }>
 *
 * Input (customPantryItemSchema): ingredient fields (name/unitClass/
 * nutrition + optional brand/barcode/packageQuantity/packageUnit) +
 * initialQuantity (>= 0) + unit. Creates the CUSTOM ingredient and its
 * pantry row atomically. Duplicate barcode -> VALIDATION_ERROR with
 * fieldErrors.barcode (pre-check + UNIQUE race backstop, never a raw
 * constraint message).
 * ===========================================================================
 */
describe("app/actions/custom-pantry-item-actions", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-custom-action-test-${randomUUID()}-`));
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

  function counts(): { ingredients: number; items: number } {
    const sqlite = new Database(dbPath);
    const ingredients = (sqlite.prepare("SELECT COUNT(*) AS n FROM ingredient").get() as { n: number }).n;
    const items = (sqlite.prepare("SELECT COUNT(*) AS n FROM pantry_item").get() as { n: number }).n;
    sqlite.close();
    return { ingredients, items };
  }

  function validInput(overrides: Record<string, unknown> = {}) {
    return {
      name: "Ritz crackers",
      unitClass: "MASS",
      caloriesPerRef: 492,
      proteinPerRef: 7,
      carbsPerRef: 61,
      fatPerRef: 24,
      brand: "Ritz",
      barcode: "064100128866",
      packageQuantity: 200,
      packageUnit: "g",
      initialQuantity: 200,
      unit: "g",
      ...overrides,
    };
  }

  it("creates the CUSTOM ingredient and pantry row together", async () => {
    const { createCustomPantryItem } = await import("@/app/actions/custom-pantry-item-actions");
    const result = await createCustomPantryItem(validInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ingredient.source).toBe("CUSTOM");
      expect(result.data.ingredient.barcode).toBe("064100128866");
      expect(result.data.item.ingredientId).toBe(result.data.ingredient.id);
      expect(result.data.item.displayQuantity).toBe(200);
      expect(result.data.item.displayUnit).toBe("g");
    }
    expect(counts()).toEqual({ ingredients: 1, items: 1 });
  });

  it("accepts initialQuantity 0 — born out of stock, row persists", async () => {
    const { createCustomPantryItem } = await import("@/app/actions/custom-pantry-item-actions");
    const result = await createCustomPantryItem(validInput({ initialQuantity: 0 }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.item.quantityCanonical).toBe(0);
      expect(result.data.item.displayQuantity).toBe(0);
    }
  });

  it("rejects invalid input with fieldErrors and creates NOTHING", async () => {
    const { createCustomPantryItem } = await import("@/app/actions/custom-pantry-item-actions");
    const input = validInput();
    delete (input as Record<string, unknown>).name;

    const result = await createCustomPantryItem(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.fieldErrors?.name).toBeDefined();
    }
    expect(counts()).toEqual({ ingredients: 0, items: 0 });
  });

  it("rejects a duplicate barcode with a friendly field error", async () => {
    const { createCustomPantryItem } = await import("@/app/actions/custom-pantry-item-actions");
    await createCustomPantryItem(validInput());

    const result = await createCustomPantryItem(validInput({ name: "Ritz clone" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.fieldErrors?.barcode?.[0]).toMatch(/already exists/i);
    }
    expect(counts()).toEqual({ ingredients: 1, items: 1 });
  });

  it("allows two barcode-less items", async () => {
    const { createCustomPantryItem } = await import("@/app/actions/custom-pantry-item-actions");
    const first = await createCustomPantryItem(validInput({ barcode: undefined, name: "A" }));
    const second = await createCustomPantryItem(validInput({ barcode: undefined, name: "B" }));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(counts()).toEqual({ ingredients: 2, items: 2 });
  });
});
