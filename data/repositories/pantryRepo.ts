/**
 * Pantry repository — upsert-friendly primitives + the Flow C index read
 * (architecture.md §4/§6). Repos are dumb persistence: canonical
 * conversion and increment/replace decisions happen in the Server Action,
 * not here (docs/stories/S-202-repositories.md Dev Notes).
 */
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { ingredient, pantryItem } from "@/data/schema";
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
  stockedAt: string | null;
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
  /** openspec: pantry-freshness — set by the ACTION only when stock increased. */
  stockedAt?: string;
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
    stockedAt: row.stockedAt,
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
      stockedAt: nowIso(),
    })
    .returning();
  return toRecord(row);
}

export async function getByIngredientId(db: Db, ingredientId: number): Promise<PantryItemRecord | null> {
  const [row] = await db.select().from(pantryItem).where(eq(pantryItem.ingredientId, ingredientId));
  return row ? toRecord(row) : null;
}

/** openspec: pantry-item-detail — the `/pantry/[id]` route resolves by row id. */
export async function getById(db: Db, id: number): Promise<PantryItemRecord | null> {
  const [row] = await db.select().from(pantryItem).where(eq(pantryItem.id, id));
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

export interface PantryListRow {
  id: number;
  ingredientId: number;
  ingredientName: string;
  displayQuantity: number;
  displayUnit: string;
  stockedAt: string | null;
  shelfLifeDays: number | null;
  readyToEat: boolean;
  category: "FOOD" | "DRINK" | "SUPPLEMENT";
  unitClass: "MASS" | "VOLUME" | "COUNT";
  packageQuantity: number | null;
  packageUnit: string | null;
  /** openspec: pack-units — the inner pack (Eat prefill, −1 pack preset). */
  packQuantity: number | null;
  packUnit: string | null;
}

/**
 * The full pantry list joined with the ingredient's display name (for
 * `app/pantry/page.tsx`, S-304) — a single join, no per-row lookup. Ordered
 * by ingredient name for a stable, readable listing.
 */
export async function getAllWithIngredientNames(db: Db): Promise<PantryListRow[]> {
  const rows = await db
    .select({
      id: pantryItem.id,
      ingredientId: pantryItem.ingredientId,
      ingredientName: ingredient.name,
      displayQuantity: pantryItem.displayQuantity,
      displayUnit: pantryItem.displayUnit,
      stockedAt: pantryItem.stockedAt,
      shelfLifeDays: ingredient.shelfLifeDays,
      readyToEat: ingredient.readyToEat,
      category: ingredient.category,
      unitClass: ingredient.unitClass,
      packageQuantity: ingredient.packageQuantity,
      packageUnit: ingredient.packageUnit,
      packQuantity: ingredient.packQuantity,
      packUnit: ingredient.packUnit,
    })
    .from(pantryItem)
    .innerJoin(ingredient, eq(ingredient.id, pantryItem.ingredientId))
    .orderBy(ingredient.name);

  return rows;
}

/** All pantry rows as full records (openspec: cook-recipe-into-meals —
 * the cook planner needs canonical quantity + basis + row id per
 * ingredient). */
export async function getAll(db: Db): Promise<PantryItemRecord[]> {
  const rows = await db.select().from(pantryItem);
  return rows.map(toRecord);
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

/** One planned decrement against a pantry row (openspec:
 * cook-recipe-into-meals design D3) — `amount` is in the ROW's own
 * canonical basis, already resolved by the caller. */
export interface PantryDecrement {
  pantryItemId: number;
  amountInRowBasis: number;
}

export interface AppliedDecrement {
  pantryItemId: number;
  consumed: number;
  /** Requirement beyond available stock — consumed-to-zero flag (> 0). */
  shortfall: number;
}

/**
 * Applies every decrement in ONE synchronous better-sqlite3 transaction
 * (same posture as recipeRepo's multi-row writes). Floors at zero — a
 * shortfall consumes what's there and reports the gap; a missing row id
 * throws, rolling the whole transaction back.
 */
export function consume(db: Db, decrements: PantryDecrement[], displayFactorFor: (displayUnit: string) => number): AppliedDecrement[] {
  return db.transaction((tx) => {
    const applied: AppliedDecrement[] = [];
    for (const decrement of decrements) {
      const [row] = tx.select().from(pantryItem).where(eq(pantryItem.id, decrement.pantryItemId)).all();
      if (!row) {
        throw new Error(`pantry item ${decrement.pantryItemId} does not exist`);
      }
      const consumed = Math.min(row.quantityCanonical, decrement.amountInRowBasis);
      const newCanonical = row.quantityCanonical - consumed;
      tx.update(pantryItem)
        .set({
          quantityCanonical: newCanonical,
          displayQuantity: newCanonical / displayFactorFor(row.displayUnit),
          updatedAt: nowIso(),
        })
        .where(eq(pantryItem.id, decrement.pantryItemId))
        .run();
      applied.push({
        pantryItemId: decrement.pantryItemId,
        consumed,
        shortfall: decrement.amountInRowBasis - consumed,
      });
    }
    return applied;
  });
}
