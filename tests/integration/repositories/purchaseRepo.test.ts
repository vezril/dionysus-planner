import { beforeEach, describe, expect, it } from "vitest";
import * as purchaseRepo from "@/data/repositories/purchaseRepo";
import * as pantryRepo from "@/data/repositories/pantryRepo";
import { createMigratedDrizzleDb, type MigratedDrizzleDb } from "../support/migratedDb";
import { insertRawIngredient } from "../support/rawFixtures";

/**
 * openspec: pantry-item-detail — purchaseRepo.
 *
 * ============================ PINNED API SHAPE ============================
 * interface PurchaseRecord {
 *   id: number; ingredientId: number; price: number;
 *   store: string | null; displayQuantity: number | null;
 *   displayUnit: string | null; purchasedAt: string; createdAt: string;
 * }
 * purchaseRepo.create(db, input): Promise<PurchaseRecord>
 * purchaseRepo.listByIngredientId(db, ingredientId): Promise<PurchaseRecord[]>  // most recent first
 * purchaseRepo.getById(db, id): Promise<PurchaseRecord | null>
 * purchaseRepo.deleteById(db, id): Promise<void>
 *
 * Keyed by INGREDIENT (design.md Decision 1): history must survive pantry
 * item removal, and cascade away with a deleted ingredient.
 * ===========================================================================
 */
describe("data/repositories/purchaseRepo", () => {
  let db: MigratedDrizzleDb;
  let sqlite: ReturnType<typeof createMigratedDrizzleDb>["sqlite"];
  let ingredientId: number;

  beforeEach(() => {
    ({ db, sqlite } = createMigratedDrizzleDb());
    ingredientId = insertRawIngredient(sqlite, { name: "Butter", unitClass: "MASS" });
  });

  function insert(price: number, purchasedAt: string, store: string | null = null) {
    return purchaseRepo.create(db, {
      ingredientId,
      price,
      store,
      displayQuantity: null,
      displayUnit: null,
      purchasedAt,
    });
  }

  it("round-trips a full purchase record", async () => {
    const created = await purchaseRepo.create(db, {
      ingredientId,
      price: 8.49,
      store: "Metro",
      displayQuantity: 1,
      displayUnit: "kg",
      purchasedAt: "2026-08-19",
    });
    expect(created.id).toBeGreaterThan(0);
    expect(created.price).toBe(8.49);
    expect(created.store).toBe("Metro");
    expect(created.displayQuantity).toBe(1);
    expect(created.displayUnit).toBe("kg");
    expect(created.purchasedAt).toBe("2026-08-19");

    const fetched = await purchaseRepo.getById(db, created.id);
    expect(fetched).toEqual(created);
  });

  it("accepts a price-only purchase (store/quantity nullable)", async () => {
    const created = await insert(4.99, "2026-08-10");
    expect(created.store).toBeNull();
    expect(created.displayQuantity).toBeNull();
    expect(created.displayUnit).toBeNull();
  });

  it("lists purchases most recent first (by purchasedAt, then insertion order)", async () => {
    const older = await insert(5.99, "2026-08-01");
    const newest = await insert(4.49, "2026-08-15");
    const sameDayFirst = await insert(6.25, "2026-08-15");

    const listed = await purchaseRepo.listByIngredientId(db, ingredientId);
    expect(listed.map((p) => p.id)).toEqual([sameDayFirst.id, newest.id, older.id]);
  });

  it("scopes the listing to the given ingredient", async () => {
    const otherIngredientId = insertRawIngredient(sqlite, { name: "Flour", unitClass: "MASS" });
    await insert(5.99, "2026-08-01");
    await purchaseRepo.create(db, {
      ingredientId: otherIngredientId,
      price: 2.99,
      store: null,
      displayQuantity: null,
      displayUnit: null,
      purchasedAt: "2026-08-02",
    });

    const listed = await purchaseRepo.listByIngredientId(db, ingredientId);
    expect(listed).toHaveLength(1);
    expect(listed[0].price).toBe(5.99);
  });

  it("deleteById removes exactly the one purchase", async () => {
    const a = await insert(5.99, "2026-08-01");
    const b = await insert(4.49, "2026-08-15");
    await purchaseRepo.deleteById(db, a.id);

    expect(await purchaseRepo.getById(db, a.id)).toBeNull();
    expect((await purchaseRepo.listByIngredientId(db, ingredientId)).map((p) => p.id)).toEqual([b.id]);
  });

  it("history survives pantry item removal (keyed by ingredient, not pantry row)", async () => {
    const item = await pantryRepo.insert(db, {
      ingredientId,
      quantityCanonical: 500,
      entryUnitClass: "MASS",
      displayQuantity: 500,
      displayUnit: "g",
    });
    await insert(5.99, "2026-08-01");

    await pantryRepo.remove(db, item.id);

    const listed = await purchaseRepo.listByIngredientId(db, ingredientId);
    expect(listed).toHaveLength(1);
  });

  it("cascades away when the ingredient is deleted", async () => {
    await insert(5.99, "2026-08-01");
    sqlite.prepare("DELETE FROM ingredient WHERE id = ?").run(ingredientId);

    const listed = await purchaseRepo.listByIngredientId(db, ingredientId);
    expect(listed).toHaveLength(0);
  });
});
