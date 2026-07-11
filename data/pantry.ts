/**
 * Pantry data-layer entry points for `app/actions/pantry-actions.ts` and
 * `app/pantry/page.tsx` (docs/stories/S-304). Kept in `/data/**` (not the
 * action/page themselves) per architecture.md §5's boundary rule — only
 * `/data/**` may import drizzle-orm/better-sqlite3 — mirroring `data/
 * ingredients.ts`'s per-call `createDb()` pattern: a fresh connection per
 * call, closed before returning, no module-scope singleton.
 *
 * This module is dumb persistence + one join for display (ingredient name):
 * the upsert/increment/replace DECISION logic lives in the Server Action,
 * not here (docs/stories/S-202-repositories.md Dev Notes carried forward).
 */
import { createDb } from "@/data/db";
import * as pantryRepo from "@/data/repositories/pantryRepo";
import type {
  PantryItemInsertInput,
  PantryItemQuantityPatch,
  PantryItemRecord,
} from "@/data/repositories/pantryRepo";
import * as ingredientRepo from "@/data/repositories/ingredientRepo";
import type { IngredientRecord } from "@/data/repositories/ingredientRepo";

export type { PantryItemRecord } from "@/data/repositories/pantryRepo";

export type { PantryListRow } from "@/data/repositories/pantryRepo";

/**
 * Full pantry list for `app/pantry/page.tsx` (RSC), joined with the
 * ingredient name for display. No pagination at NFR-3 scale (architecture.md
 * §6 "Lists render in full").
 */
export async function getPantryList() {
  const db = createDb();
  try {
    return await pantryRepo.getAllWithIngredientNames(db);
  } finally {
    db.$client.close();
  }
}

export async function getIngredientRecordById(id: number): Promise<IngredientRecord | null> {
  const db = createDb();
  try {
    return await ingredientRepo.getById(db, id);
  } finally {
    db.$client.close();
  }
}

export async function getPantryItemByIngredientId(ingredientId: number): Promise<PantryItemRecord | null> {
  const db = createDb();
  try {
    return await pantryRepo.getByIngredientId(db, ingredientId);
  } finally {
    db.$client.close();
  }
}

export async function insertPantryItem(input: PantryItemInsertInput): Promise<PantryItemRecord> {
  const db = createDb();
  try {
    return await pantryRepo.insert(db, input);
  } finally {
    db.$client.close();
  }
}

export async function updatePantryItemQuantity(
  id: number,
  patch: PantryItemQuantityPatch,
): Promise<PantryItemRecord> {
  const db = createDb();
  try {
    return await pantryRepo.updateQuantity(db, id, patch);
  } finally {
    db.$client.close();
  }
}

export async function removePantryItem(id: number): Promise<void> {
  const db = createDb();
  try {
    await pantryRepo.remove(db, id);
  } finally {
    db.$client.close();
  }
}
