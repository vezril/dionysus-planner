import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";

/**
 * openspec: custom-pantry-items — data layer: product-identity fields,
 * barcode uniqueness (NULLs unlimited), and the one-transaction
 * ingredient+pantry create (all-or-nothing).
 *
 * Uses the file-DB + DB_PATH pattern (not migratedDb's :memory:) because
 * `data/customPantryItems.ts` opens its own connection via createDb().
 */
describe("data/customPantryItems", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-custom-item-test-${randomUUID()}-`));
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

  function baseInput(overrides: Record<string, unknown> = {}) {
    return {
      name: "Ritz crackers",
      unitClass: "MASS" as const,
      densityGPerMl: null,
      caloriesPerRef: 492,
      proteinPerRef: 7,
      carbsPerRef: 61,
      fatPerRef: 24,
      fiberPerRef: null,
      sugarPerRef: 7.5,
      sodiumMgPerRef: 882,
      brand: "Ritz",
      barcode: "064100128866",
      packageQuantity: 200,
      packageUnit: "g",
      quantityCanonical: 200,
      entryUnitClass: "MASS" as const,
      displayQuantity: 200,
      displayUnit: "g",
      ...overrides,
    };
  }

  it("creates ingredient + pantry row together, product fields round-trip", async () => {
    const { createCustomPantryItemRecords } = await import("@/data/customPantryItems");
    const result = await createCustomPantryItemRecords(baseInput());

    expect(result.ingredient.source).toBe("CUSTOM");
    expect(result.ingredient.brand).toBe("Ritz");
    expect(result.ingredient.barcode).toBe("064100128866");
    expect(result.ingredient.packageQuantity).toBe(200);
    expect(result.ingredient.packageUnit).toBe("g");
    expect(result.item.ingredientId).toBe(result.ingredient.id);
    expect(result.item.displayQuantity).toBe(200);
  });

  it("supports a zero-quantity pantry row (out of stock from birth)", async () => {
    const { createCustomPantryItemRecords } = await import("@/data/customPantryItems");
    const result = await createCustomPantryItemRecords(
      baseInput({ quantityCanonical: 0, displayQuantity: 0 }),
    );
    expect(result.item.quantityCanonical).toBe(0);
  });

  it("rejects a duplicate barcode at the DB level, and the transaction leaves nothing behind", async () => {
    const { createCustomPantryItemRecords } = await import("@/data/customPantryItems");
    await createCustomPantryItemRecords(baseInput());

    await expect(
      createCustomPantryItemRecords(baseInput({ name: "Ritz clone" })),
    ).rejects.toThrow(/UNIQUE/i);

    const sqlite = new Database(dbPath);
    const ingredients = sqlite.prepare("SELECT COUNT(*) AS n FROM ingredient WHERE name = 'Ritz clone'").get() as { n: number };
    const items = sqlite.prepare("SELECT COUNT(*) AS n FROM pantry_item").get() as { n: number };
    sqlite.close();
    expect(ingredients.n).toBe(0);
    expect(items.n).toBe(1); // only the first create's row
  });

  it("allows unlimited barcode-less products", async () => {
    const { createCustomPantryItemRecords } = await import("@/data/customPantryItems");
    await createCustomPantryItemRecords(baseInput({ barcode: null, name: "No-name crackers" }));
    await createCustomPantryItemRecords(baseInput({ barcode: null, name: "Other crackers" }));

    const sqlite = new Database(dbPath);
    const n = (sqlite.prepare("SELECT COUNT(*) AS n FROM ingredient WHERE barcode IS NULL").get() as { n: number }).n;
    sqlite.close();
    expect(n).toBe(2);
  });

  it("findIngredientByBarcode resolves the product (the scanner seam)", async () => {
    const { createCustomPantryItemRecords, findIngredientByBarcode } = await import("@/data/customPantryItems");
    const created = await createCustomPantryItemRecords(baseInput());

    const found = await findIngredientByBarcode("064100128866");
    expect(found?.id).toBe(created.ingredient.id);
    expect(await findIngredientByBarcode("000000000000")).toBeNull();
  });
});
