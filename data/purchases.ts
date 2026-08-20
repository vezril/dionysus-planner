/**
 * Purchase + pantry-item-detail data-layer entry points (openspec:
 * pantry-item-detail) for `app/actions/purchase-actions.ts` and
 * `app/pantry/[id]/page.tsx`. Same per-call `createDb()` pattern as the
 * other facades — a fresh connection per call, closed before returning
 * (architecture.md §5 boundary rule: only /data/** imports drizzle).
 */
import { createDb } from "@/data/db";
import * as purchaseRepo from "@/data/repositories/purchaseRepo";
import type { PurchaseInsertInput, PurchaseRecord } from "@/data/repositories/purchaseRepo";
import * as pantryRepo from "@/data/repositories/pantryRepo";
import type { PantryItemRecord } from "@/data/repositories/pantryRepo";
import * as ingredientRepo from "@/data/repositories/ingredientRepo";
import type { IngredientRecord } from "@/data/repositories/ingredientRepo";

export type { PurchaseRecord } from "@/data/repositories/purchaseRepo";

export interface PantryItemDetail {
  item: PantryItemRecord;
  ingredient: IngredientRecord;
  purchases: PurchaseRecord[];
  micronutrients: ingredientRepo.MicronutrientRow[];
}

/**
 * Everything `/pantry/[id]` renders, in one call: the pantry item, its
 * ingredient (nutrition facts), and the ingredient's purchase history
 * (most recent first). `null` when the pantry item doesn't exist — the
 * page maps that to `notFound()`.
 */
export async function getPantryItemDetail(pantryItemId: number): Promise<PantryItemDetail | null> {
  const db = createDb();
  try {
    const item = await pantryRepo.getById(db, pantryItemId);
    if (!item) return null;
    const ingredient = await ingredientRepo.getById(db, item.ingredientId);
    if (!ingredient) return null;
    const purchases = await purchaseRepo.listByIngredientId(db, item.ingredientId);
    // openspec: vitamin-tracking — sparse rows for the detail page.
    const micronutrients = await ingredientRepo.getMicronutrients(db, item.ingredientId);
    return { item, ingredient, purchases, micronutrients };
  } finally {
    db.$client.close();
  }
}

export async function createPurchaseRecord(input: PurchaseInsertInput): Promise<PurchaseRecord> {
  const db = createDb();
  try {
    return await purchaseRepo.create(db, input);
  } finally {
    db.$client.close();
  }
}

export async function getPurchaseRecordById(id: number): Promise<PurchaseRecord | null> {
  const db = createDb();
  try {
    return await purchaseRepo.getById(db, id);
  } finally {
    db.$client.close();
  }
}

export async function removePurchaseRecord(id: number): Promise<void> {
  const db = createDb();
  try {
    await purchaseRepo.deleteById(db, id);
  } finally {
    db.$client.close();
  }
}

/** True iff the ingredient exists — createPurchase's pre-check. */
export async function ingredientExists(ingredientId: number): Promise<boolean> {
  const db = createDb();
  try {
    return (await ingredientRepo.getById(db, ingredientId)) !== null;
  } finally {
    db.$client.close();
  }
}
