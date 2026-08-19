/**
 * Purchase repository (openspec: pantry-item-detail). Dumb persistence,
 * same discipline as pantryRepo: validation and derived price stats live
 * in the Server Action / domain layer, not here.
 */
import { desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { purchase } from "@/data/schema";
import * as schema from "@/data/schema";

type Db = BetterSQLite3Database<typeof schema>;

export interface PurchaseRecord {
  id: number;
  ingredientId: number;
  price: number;
  store: string | null;
  displayQuantity: number | null;
  displayUnit: string | null;
  purchasedAt: string;
  createdAt: string;
}

export interface PurchaseInsertInput {
  ingredientId: number;
  price: number;
  store: string | null;
  displayQuantity: number | null;
  displayUnit: string | null;
  purchasedAt: string;
}

function toRecord(row: typeof purchase.$inferSelect): PurchaseRecord {
  return {
    id: row.id,
    ingredientId: row.ingredientId,
    price: row.price,
    store: row.store,
    displayQuantity: row.displayQuantity,
    displayUnit: row.displayUnit,
    purchasedAt: row.purchasedAt,
    createdAt: row.createdAt,
  };
}

export async function create(db: Db, input: PurchaseInsertInput): Promise<PurchaseRecord> {
  const [row] = await db
    .insert(purchase)
    .values({ ...input, createdAt: new Date().toISOString() })
    .returning();
  return toRecord(row);
}

/** Most recent first — by purchase date, then insertion order for same-day rows. */
export async function listByIngredientId(db: Db, ingredientId: number): Promise<PurchaseRecord[]> {
  const rows = await db
    .select()
    .from(purchase)
    .where(eq(purchase.ingredientId, ingredientId))
    .orderBy(desc(purchase.purchasedAt), desc(purchase.id));
  return rows.map(toRecord);
}

export async function getById(db: Db, id: number): Promise<PurchaseRecord | null> {
  const [row] = await db.select().from(purchase).where(eq(purchase.id, id));
  return row ? toRecord(row) : null;
}

export async function deleteById(db: Db, id: number): Promise<void> {
  await db.delete(purchase).where(eq(purchase.id, id));
}
