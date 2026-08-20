import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient } from "./support/rawFixtures";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * openspec: pantry-freshness — stockedAt lifecycle: set on create, reset
 * on increase (increment/replace-up/edit-up), kept on decrease and on
 * consumption.
 */
describe("stockedAt lifecycle", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  let flourId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-freshness-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    vi.resetModules();

    const sqlite = new Database(dbPath);
    runMigrations(sqlite);
    flourId = insertRawIngredient(sqlite, { name: "Flour", unitClass: "MASS" });
    sqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  function stockedAt(rowId: number): string | null {
    const sqlite = new Database(dbPath);
    const row = sqlite.prepare("SELECT stockedAt FROM pantry_item WHERE id = ?").get(rowId) as {
      stockedAt: string | null;
    };
    sqlite.close();
    return row.stockedAt;
  }

  function backdate(rowId: number, iso: string): void {
    const sqlite = new Database(dbPath);
    sqlite.prepare("UPDATE pantry_item SET stockedAt = ? WHERE id = ?").run(iso, rowId);
    sqlite.close();
  }

  const OLD = "2026-08-01T00:00:00.000Z";

  it("create stamps stockedAt; increment resets it", async () => {
    const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
    const created = await addOrUpdatePantryItem({ ingredientId: flourId, quantity: 500, unit: "g" });
    expect(created.ok).toBe(true);
    const rowId = created.ok ? created.data.id : -1;
    expect(stockedAt(rowId)).not.toBeNull();

    backdate(rowId, OLD);
    const incremented = await addOrUpdatePantryItem({ ingredientId: flourId, quantity: 100, unit: "g", mode: "increment" });
    expect(incremented.ok).toBe(true);
    expect(stockedAt(rowId)).not.toBe(OLD);
  });

  it("edit downward keeps the clock; edit upward resets it", async () => {
    const { addOrUpdatePantryItem, updatePantryItem } = await import("@/app/actions/pantry-actions");
    const created = await addOrUpdatePantryItem({ ingredientId: flourId, quantity: 500, unit: "g" });
    const rowId = created.ok ? created.data.id : -1;

    backdate(rowId, OLD);
    expect((await updatePantryItem(rowId, { quantity: 300, unit: "g" })).ok).toBe(true);
    expect(stockedAt(rowId)).toBe(OLD);

    expect((await updatePantryItem(rowId, { quantity: 900, unit: "g" })).ok).toBe(true);
    expect(stockedAt(rowId)).not.toBe(OLD);
  });

  it("replace downward keeps the clock; replace upward resets it", async () => {
    const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
    const created = await addOrUpdatePantryItem({ ingredientId: flourId, quantity: 500, unit: "g" });
    const rowId = created.ok ? created.data.id : -1;

    backdate(rowId, OLD);
    expect((await addOrUpdatePantryItem({ ingredientId: flourId, quantity: 200, unit: "g", mode: "replace" })).ok).toBe(true);
    expect(stockedAt(rowId)).toBe(OLD);

    expect((await addOrUpdatePantryItem({ ingredientId: flourId, quantity: 800, unit: "g", mode: "replace" })).ok).toBe(true);
    expect(stockedAt(rowId)).not.toBe(OLD);
  });

  it("consumption (the cook path's decrement) never touches stockedAt", async () => {
    const { addOrUpdatePantryItem } = await import("@/app/actions/pantry-actions");
    const created = await addOrUpdatePantryItem({ ingredientId: flourId, quantity: 500, unit: "g" });
    const rowId = created.ok ? created.data.id : -1;
    backdate(rowId, OLD);

    const { consumeFromPantry } = await import("@/data/pantry");
    await consumeFromPantry([{ pantryItemId: rowId, amountInRowBasis: 200 }]);
    expect(stockedAt(rowId)).toBe(OLD);
  });
});
