import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient } from "./support/rawFixtures";

// revalidatePath throws outside a live request context — mocked exactly as
// in every other action suite here.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * openspec: pantry-item-detail — `createPurchase` / `deletePurchase`
 * Server Actions.
 *
 * ============================ PINNED CONTRACT ============================
 * export async function createPurchase(input: unknown): Promise<ActionResult<PurchaseRecord>>
 * export async function deletePurchase(id: number): Promise<ActionResult<{ id: number }>>
 *
 * ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code, message, fieldErrors? } }
 * Codes: VALIDATION_ERROR (schema), NOT_FOUND (unknown ingredient / purchase),
 * PERSISTENCE_ERROR (write failure).
 *
 * Input shape (purchaseSchema): { ingredientId, price, store?, displayQuantity?,
 * displayUnit?, purchasedAt: "YYYY-MM-DD" }. Optional fields persist as null.
 * ===========================================================================
 */
describe("app/actions/purchase-actions", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-purchase-actions-test-${randomUUID()}-`));
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

  function seedIngredient(): number {
    const sqlite = new Database(dbPath);
    const id = insertRawIngredient(sqlite, { name: "Butter", unitClass: "MASS" });
    sqlite.close();
    return id;
  }

  function countPurchases(): number {
    const sqlite = new Database(dbPath);
    const row = sqlite.prepare("SELECT COUNT(*) AS n FROM purchase").get() as { n: number };
    sqlite.close();
    return row.n;
  }

  it("creates a price-only purchase; optional fields persist as null", async () => {
    const { createPurchase } = await import("@/app/actions/purchase-actions");
    const ingredientId = seedIngredient();

    const result = await createPurchase({ ingredientId, price: 4.99, purchasedAt: "2026-08-19" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(4.99);
      expect(result.data.store).toBeNull();
      expect(result.data.displayQuantity).toBeNull();
      expect(result.data.displayUnit).toBeNull();
      expect(result.data.purchasedAt).toBe("2026-08-19");
    }
  });

  it("creates a full purchase (store + quantity + unit)", async () => {
    const { createPurchase } = await import("@/app/actions/purchase-actions");
    const ingredientId = seedIngredient();

    const result = await createPurchase({
      ingredientId,
      price: 8.49,
      store: "Metro",
      displayQuantity: 1,
      displayUnit: "kg",
      purchasedAt: "2026-08-19",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.store).toBe("Metro");
      expect(result.data.displayQuantity).toBe(1);
      expect(result.data.displayUnit).toBe("kg");
    }
  });

  it("rejects a missing price with VALIDATION_ERROR and writes nothing", async () => {
    const { createPurchase } = await import("@/app/actions/purchase-actions");
    const ingredientId = seedIngredient();

    const result = await createPurchase({ ingredientId, purchasedAt: "2026-08-19" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION_ERROR");
      expect(result.error.fieldErrors?.price).toBeDefined();
    }
    expect(countPurchases()).toBe(0);
  });

  it("rejects a negative price", async () => {
    const { createPurchase } = await import("@/app/actions/purchase-actions");
    const ingredientId = seedIngredient();

    const result = await createPurchase({ ingredientId, price: -1, purchasedAt: "2026-08-19" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns NOT_FOUND for an unknown ingredientId, writes nothing", async () => {
    const { createPurchase } = await import("@/app/actions/purchase-actions");

    const result = await createPurchase({ ingredientId: 999, price: 4.99, purchasedAt: "2026-08-19" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    expect(countPurchases()).toBe(0);
  });

  it("deletePurchase removes an existing purchase", async () => {
    const { createPurchase, deletePurchase } = await import("@/app/actions/purchase-actions");
    const ingredientId = seedIngredient();
    const created = await createPurchase({ ingredientId, price: 4.99, purchasedAt: "2026-08-19" });
    expect(created.ok).toBe(true);
    const id = created.ok ? created.data.id : -1;

    const result = await deletePurchase(id);
    expect(result).toEqual({ ok: true, data: { id } });
    expect(countPurchases()).toBe(0);
  });

  it("deletePurchase on an unknown id returns NOT_FOUND", async () => {
    const { deletePurchase } = await import("@/app/actions/purchase-actions");
    const result = await deletePurchase(12345);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});
