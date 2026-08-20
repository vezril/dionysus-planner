/**
 * openspec: custom-pantry-items — the one-step "create a branded product
 * into the pantry" facade: CUSTOM ingredient + pantry row in ONE
 * better-sqlite3 transaction (design.md Decision 3 — never one without the
 * other; same synchronous-callback transaction discipline as
 * recipeRepo.createWithLines). Per-call `createDb()`, closed before
 * returning, per the /data/** conventions.
 */
import { createDb } from "@/data/db";
import { ingredient, pantryItem } from "@/data/schema";
import type { IngredientRecord } from "@/data/repositories/ingredientRepo";
import * as ingredientRepo from "@/data/repositories/ingredientRepo";
import type { PantryItemRecord } from "@/data/repositories/pantryRepo";
import type { UnitClass } from "@/domain/types";

export interface CustomPantryItemInput {
  name: string;
  unitClass: UnitClass;
  densityGPerMl: number | null;
  caloriesPerRef: number;
  proteinPerRef: number;
  carbsPerRef: number;
  fatPerRef: number;
  fiberPerRef: number | null;
  sugarPerRef: number | null;
  sodiumMgPerRef: number | null;
  alcoholGPerRef: number | null;
  saturatedFatGPerRef: number | null;
  transFatGPerRef: number | null;
  cholesterolMgPerRef: number | null;
  category: "FOOD" | "DRINK" | "SUPPLEMENT";
  shelfLifeDays: number | null;
  brand: string | null;
  barcode: string | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  // Pantry half — canonical conversion happens in the Server Action, same
  // division of labor as addOrUpdatePantryItem (S-202 Dev Notes).
  quantityCanonical: number;
  entryUnitClass: UnitClass;
  displayQuantity: number;
  displayUnit: string;
}

export interface CustomPantryItemResult {
  ingredient: IngredientRecord;
  item: PantryItemRecord;
}

export async function createCustomPantryItemRecords(
  input: CustomPantryItemInput,
): Promise<CustomPantryItemResult> {
  const db = createDb();
  try {
    return db.transaction((tx) => {
      const timestamp = new Date().toISOString();
      const [ingredientRow] = tx
        .insert(ingredient)
        .values({
          seedKey: null,
          name: input.name,
          unitClass: input.unitClass,
          densityGPerMl: input.densityGPerMl,
          caloriesPerRef: input.caloriesPerRef,
          proteinPerRef: input.proteinPerRef,
          carbsPerRef: input.carbsPerRef,
          fatPerRef: input.fatPerRef,
          fiberPerRef: input.fiberPerRef,
          sugarPerRef: input.sugarPerRef,
          sodiumMgPerRef: input.sodiumMgPerRef,
          alcoholGPerRef: input.alcoholGPerRef,
          saturatedFatGPerRef: input.saturatedFatGPerRef,
          transFatGPerRef: input.transFatGPerRef,
          cholesterolMgPerRef: input.cholesterolMgPerRef,
          category: input.category,
          shelfLifeDays: input.shelfLifeDays,
          source: "CUSTOM",
          overridden: false,
          brand: input.brand,
          barcode: input.barcode,
          packageQuantity: input.packageQuantity,
          packageUnit: input.packageUnit,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning()
        .all();

      const [itemRow] = tx
        .insert(pantryItem)
        .values({
          ingredientId: ingredientRow.id,
          quantityCanonical: input.quantityCanonical,
          entryUnitClass: input.entryUnitClass,
          displayQuantity: input.displayQuantity,
          stockedAt: timestamp,
          displayUnit: input.displayUnit,
          updatedAt: timestamp,
        })
        .returning()
        .all();

      return {
        ingredient: {
          id: ingredientRow.id,
          seedKey: ingredientRow.seedKey,
          name: ingredientRow.name,
          unitClass: ingredientRow.unitClass,
          densityGPerMl: ingredientRow.densityGPerMl,
          caloriesPerRef: ingredientRow.caloriesPerRef,
          proteinPerRef: ingredientRow.proteinPerRef,
          carbsPerRef: ingredientRow.carbsPerRef,
          fatPerRef: ingredientRow.fatPerRef,
          fiberPerRef: ingredientRow.fiberPerRef,
          sugarPerRef: ingredientRow.sugarPerRef,
          sodiumMgPerRef: ingredientRow.sodiumMgPerRef,
          alcoholGPerRef: ingredientRow.alcoholGPerRef,
          saturatedFatGPerRef: ingredientRow.saturatedFatGPerRef,
          transFatGPerRef: ingredientRow.transFatGPerRef,
          cholesterolMgPerRef: ingredientRow.cholesterolMgPerRef,
          category: ingredientRow.category,
          shelfLifeDays: ingredientRow.shelfLifeDays,
          source: ingredientRow.source,
          overridden: ingredientRow.overridden,
          brand: ingredientRow.brand,
          barcode: ingredientRow.barcode,
          packageQuantity: ingredientRow.packageQuantity,
          packageUnit: ingredientRow.packageUnit,
          createdAt: ingredientRow.createdAt,
          updatedAt: ingredientRow.updatedAt,
        },
        item: {
          id: itemRow.id,
          ingredientId: itemRow.ingredientId,
          quantityCanonical: itemRow.quantityCanonical,
          entryUnitClass: itemRow.entryUnitClass,
          displayQuantity: itemRow.displayQuantity,
          displayUnit: itemRow.displayUnit,
          stockedAt: itemRow.stockedAt,
          updatedAt: itemRow.updatedAt,
        },
      };
    });
  } finally {
    db.$client.close();
  }
}

/** Duplicate-barcode pre-check for the Server Action (and the scanner
 * app's future resolution path). */
export async function findIngredientByBarcode(barcode: string): Promise<IngredientRecord | null> {
  const db = createDb();
  try {
    return await ingredientRepo.getByBarcode(db, barcode);
  } finally {
    db.$client.close();
  }
}
