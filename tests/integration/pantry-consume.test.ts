import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient, insertRawPantryItem } from "./support/rawFixtures";

/**
 * openspec: cook-recipe-into-meals — `consumeFromPantry`: one transaction,
 * floor at zero with shortfall reporting, display quantity kept consistent
 * with the row's canonical value, all-or-nothing on a bad row id.
 */
describe("data/pantry#consumeFromPantry", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  let flourId: number;
  let sodaId: number;
  let flourRowId: number;
  let sodaRowId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-consume-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    flourId = insertRawIngredient(sqlite, { name: "Flour", unitClass: "MASS" });
    sodaId = insertRawIngredient(sqlite, { name: "Soda", unitClass: "VOLUME" });
    flourRowId = insertRawPantryItem(sqlite, flourId, {
      quantityCanonical: 500,
      entryUnitClass: "MASS",
      displayQuantity: 500,
      displayUnit: "g",
    });
    sodaRowId = insertRawPantryItem(sqlite, sodaId, {
      quantityCanonical: 355,
      entryUnitClass: "VOLUME",
      displayQuantity: 355,
      displayUnit: "mL",
    });
    sqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  function rowQuantity(id: number): { quantityCanonical: number; displayQuantity: number } {
    const sqlite = new Database(dbPath);
    const row = sqlite
      .prepare("SELECT quantityCanonical, displayQuantity FROM pantry_item WHERE id = ?")
      .get(id) as { quantityCanonical: number; displayQuantity: number };
    sqlite.close();
    return row;
  }

  it("decrements multiple rows and keeps display quantities consistent", async () => {
    const { consumeFromPantry } = await import("@/data/pantry");
    const applied = await consumeFromPantry([
      { pantryItemId: flourRowId, amountInRowBasis: 150 },
      { pantryItemId: sodaRowId, amountInRowBasis: 300 },
    ]);

    expect(applied).toEqual([
      { pantryItemId: flourRowId, consumed: 150, shortfall: 0 },
      { pantryItemId: sodaRowId, consumed: 300, shortfall: 0 },
    ]);
    expect(rowQuantity(flourRowId)).toEqual({ quantityCanonical: 350, displayQuantity: 350 });
    expect(rowQuantity(sodaRowId)).toEqual({ quantityCanonical: 55, displayQuantity: 55 });
  });

  it("floors at zero and reports the shortfall", async () => {
    const { consumeFromPantry } = await import("@/data/pantry");
    const applied = await consumeFromPantry([{ pantryItemId: sodaRowId, amountInRowBasis: 400 }]);

    expect(applied).toEqual([{ pantryItemId: sodaRowId, consumed: 355, shortfall: 45 }]);
    expect(rowQuantity(sodaRowId)).toEqual({ quantityCanonical: 0, displayQuantity: 0 });
  });

  it("a bad row id rolls back the whole transaction", async () => {
    const { consumeFromPantry } = await import("@/data/pantry");
    await expect(
      consumeFromPantry([
        { pantryItemId: flourRowId, amountInRowBasis: 100 },
        { pantryItemId: 99999, amountInRowBasis: 1 },
      ]),
    ).rejects.toThrow(/does not exist/);
    expect(rowQuantity(flourRowId).quantityCanonical).toBe(500);
  });
});
