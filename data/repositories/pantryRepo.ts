/**
 * Pantry repository — upsert-friendly primitives + the Flow C index read
 * (architecture.md §4/§6). Repos are dumb persistence: canonical
 * conversion and increment/replace decisions happen in the Server Action,
 * not here (docs/stories/S-202-repositories.md Dev Notes).
 */
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { pantryItem } from "@/data/schema";
import * as schema from "@/data/schema";
import type { UnitClass } from "@/domain/types";

type Db = BetterSQLite3Database<typeof schema>;

export interface PantryItemRecord {
  id: number;
  ingredientId: number;
  quantityCanonical: number;
  entryUnitClass: UnitClass;
  displayQuantity: number;
  displayUnit: string;
  updatedAt: string;
}

export interface PantryItemInsertInput {
  ingredientId: number;
  quantityCanonical: number;
  entryUnitClass: UnitClass;
  displayQuantity: number;
  displayUnit: string;
}

export interface PantryItemQuantityPatch {
  quantityCanonical: number;
  entryUnitClass: UnitClass;
  displayQuantity: number;
  displayUnit: string;
}

export interface PantryIndexEntry {
  qtyCanonical: number;
  class: UnitClass;
}

function toRecord(row: typeof pantryItem.$inferSelect): PantryItemRecord {
  return {
    id: row.id,
    ingredientId: row.ingredientId,
    quantityCanonical: row.quantityCanonical,
    entryUnitClass: row.entryUnitClass,
    displayQuantity: row.displayQuantity,
    displayUnit: row.displayUnit,
    updatedAt: row.updatedAt,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function insert(db: Db, input: PantryItemInsertInput): Promise<PantryItemRecord> {
  const [row] = await db
    .insert(pantryItem)
    .values({
      ingredientId: input.ingredientId,
      quantityCanonical: input.quantityCanonical,
      entryUnitClass: input.entryUnitClass,
      displayQuantity: input.displayQuantity,
      displayUnit: input.displayUnit,
      updatedAt: nowIso(),
    })
    .returning();
  return toRecord(row);
}

export async function getByIngredientId(db: Db, ingredientId: number): Promise<PantryItemRecord | null> {
  const [row] = await db.select().from(pantryItem).where(eq(pantryItem.ingredientId, ingredientId));
  return row ? toRecord(row) : null;
}

export async function updateQuantity(
  db: Db,
  id: number,
  patch: PantryItemQuantityPatch,
): Promise<PantryItemRecord> {
  const [row] = await db
    .update(pantryItem)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(pantryItem.id, id))
    .returning();
  return toRecord(row);
}

export async function remove(db: Db, id: number): Promise<void> {
  await db.delete(pantryItem).where(eq(pantryItem.id, id));
}

export async function getAllAsIndex(db: Db): Promise<Map<number, PantryIndexEntry>> {
  const rows = await db
    .select({
      ingredientId: pantryItem.ingredientId,
      quantityCanonical: pantryItem.quantityCanonical,
      entryUnitClass: pantryItem.entryUnitClass,
    })
    .from(pantryItem);

  const index = new Map<number, PantryIndexEntry>();
  for (const row of rows) {
    index.set(row.ingredientId, { qtyCanonical: row.quantityCanonical, class: row.entryUnitClass });
  }
  return index;
}
