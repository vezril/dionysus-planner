/**
 * Ingredient catalog data-layer entry point for `app/api/ingredients/route.ts`
 * and `app/ingredients/page.tsx` (docs/stories/S-301). Kept in `/data/**`
 * (not the route/page themselves) per the architecture.md §5 boundary rule
 * — only `/data/**` may import drizzle-orm/better-sqlite3 — mirroring
 * `data/health.ts`'s per-call-connection pattern: a fresh `createDb()` on
 * every call (never a module-scope singleton), closed before returning, so
 * callers always observe the current `DB_PATH`/DB state.
 *
 * Projects `ingredientRepo`'s full `IngredientRecord` down to the lean
 * shape the catalog UI and the search box actually need (architecture.md
 * §5 ADR-004 — this route is also the reusable ingredient-picker backend
 * for pantry/S-304 and recipe/S-401) — keeps the RSC payload and the
 * search API response small at NFR-3's ~2,000-row ceiling.
 */
import { createDb } from "@/data/db";
import * as ingredientRepo from "@/data/repositories/ingredientRepo";
import type { IngredientRecord } from "@/data/repositories/ingredientRepo";

export interface IngredientSummary {
  id: number;
  name: string;
  unitClass: "MASS" | "VOLUME" | "COUNT";
  source: "SEEDED" | "CUSTOM";
  category: "FOOD" | "DRINK" | "SUPPLEMENT";
  caloriesPerRef: number;
  proteinPerRef: number;
  carbsPerRef: number;
  fatPerRef: number;
  /** openspec: category-tree — the product's custom category paths. */
  categories: string[];
}

function toSummary(record: IngredientRecord): Omit<IngredientSummary, "categories"> {
  return {
    id: record.id,
    name: record.name,
    unitClass: record.unitClass,
    source: record.source,
    category: record.category,
    caloriesPerRef: record.caloriesPerRef,
    proteinPerRef: record.proteinPerRef,
    carbsPerRef: record.carbsPerRef,
    fatPerRef: record.fatPerRef,
  };
}

/**
 * Missing/empty `query` returns the full catalog (`ingredientRepo.listAll`);
 * a non-empty query delegates to `ingredientRepo.searchByName` (case-
 * insensitive substring match) — the exact split pinned by
 * tests/integration/api-ingredients.test.ts and this story's AC-3.
 */
export async function getIngredientCatalog(query?: string): Promise<IngredientSummary[]> {
  const db = createDb();
  try {
    const records = !query ? await ingredientRepo.listAll(db) : await ingredientRepo.searchByName(db, query);
    // openspec: category-tree — one query, attached per product.
    const categoriesById = await ingredientRepo.getAllCategories(db);
    return records.map((record) => ({ ...toSummary(record), categories: categoriesById.get(record.id) ?? [] }));
  } finally {
    db.$client.close();
  }
}

/**
 * S-302 data-layer entry points for `app/actions/ingredient-actions.ts`
 * (docs/stories/S-302). Same per-call `createDb()` pattern as
 * `getIngredientCatalog` above — no module-scope singleton, connection
 * closed before returning. These functions are dumb persistence only (no
 * validation, no `overridden`-flag business rules): the calling action
 * owns the Zod re-validation (ADR-005) and the `overridden` transition
 * decision (architecture.md §4/§6), and passes the fully-resolved patch
 * (including the `overridden` value to persist) down to `ingredientRepo`.
 */

export interface IngredientNutritionFields {
  name: string;
  unitClass: "MASS" | "VOLUME" | "COUNT";
  caloriesPerRef: number;
  proteinPerRef: number;
  carbsPerRef: number;
  fatPerRef: number;
  fiberPerRef?: number | null;
  sugarPerRef?: number | null;
  sodiumMgPerRef?: number | null;
  alcoholGPerRef?: number | null;
  saturatedFatGPerRef?: number | null;
  transFatGPerRef?: number | null;
  cholesterolMgPerRef?: number | null;
  category?: "FOOD" | "DRINK" | "SUPPLEMENT";
  shelfLifeDays?: number | null;
  genericOfId?: number | null;
  readyToEat?: boolean;
  densityGPerMl?: number | null;
  // openspec: custom-pantry-items — optional product identity.
  brand?: string | null;
  barcode?: string | null;
  packageQuantity?: number | null;
  packageUnit?: string | null;
  packQuantity?: number | null;
  packUnit?: string | null;
}

export async function getIngredientRecordById(id: number): Promise<IngredientRecord | null> {
  const db = createDb();
  try {
    return await ingredientRepo.getById(db, id);
  } finally {
    db.$client.close();
  }
}

export async function createIngredientRecord(input: IngredientNutritionFields): Promise<IngredientRecord> {
  const db = createDb();
  try {
    return await ingredientRepo.create(db, {
      seedKey: null,
      name: input.name,
      unitClass: input.unitClass,
      densityGPerMl: input.densityGPerMl ?? null,
      caloriesPerRef: input.caloriesPerRef,
      proteinPerRef: input.proteinPerRef,
      carbsPerRef: input.carbsPerRef,
      fatPerRef: input.fatPerRef,
      fiberPerRef: input.fiberPerRef ?? null,
      sugarPerRef: input.sugarPerRef ?? null,
      sodiumMgPerRef: input.sodiumMgPerRef ?? null,
      alcoholGPerRef: input.alcoholGPerRef ?? null,
      saturatedFatGPerRef: input.saturatedFatGPerRef ?? null,
      transFatGPerRef: input.transFatGPerRef ?? null,
      cholesterolMgPerRef: input.cholesterolMgPerRef ?? null,
      category: input.category ?? "FOOD",
      shelfLifeDays: input.shelfLifeDays ?? null,
      genericOfId: input.genericOfId ?? null,
      readyToEat: input.readyToEat ?? false,
      source: "CUSTOM",
      brand: input.brand ?? null,
      barcode: input.barcode ?? null,
      packageQuantity: input.packageQuantity ?? null,
      packageUnit: input.packageUnit ?? null,
      packQuantity: input.packQuantity ?? null,
      packUnit: input.packUnit ?? null,
    });
  } finally {
    db.$client.close();
  }
}

export async function updateIngredientNutritionRecord(
  id: number,
  patch: IngredientNutritionFields & { overridden: boolean },
): Promise<IngredientRecord> {
  const db = createDb();
  try {
    return await ingredientRepo.update(db, id, {
      name: patch.name,
      densityGPerMl: patch.densityGPerMl ?? null,
      caloriesPerRef: patch.caloriesPerRef,
      proteinPerRef: patch.proteinPerRef,
      carbsPerRef: patch.carbsPerRef,
      fatPerRef: patch.fatPerRef,
      fiberPerRef: patch.fiberPerRef ?? null,
      sugarPerRef: patch.sugarPerRef ?? null,
      sodiumMgPerRef: patch.sodiumMgPerRef ?? null,
      alcoholGPerRef: patch.alcoholGPerRef ?? null,
      saturatedFatGPerRef: patch.saturatedFatGPerRef ?? null,
      transFatGPerRef: patch.transFatGPerRef ?? null,
      cholesterolMgPerRef: patch.cholesterolMgPerRef ?? null,
      category: patch.category ?? "FOOD",
      shelfLifeDays: patch.shelfLifeDays ?? null,
      genericOfId: patch.genericOfId ?? null,
      readyToEat: patch.readyToEat ?? false,
      overridden: patch.overridden,
      brand: patch.brand ?? null,
      barcode: patch.barcode ?? null,
      packageQuantity: patch.packageQuantity ?? null,
      packageUnit: patch.packageUnit ?? null,
      packQuantity: patch.packQuantity ?? null,
      packUnit: patch.packUnit ?? null,
    });
  } finally {
    db.$client.close();
  }
}

/**
 * S-303 data-layer entry points for `app/actions/ingredient-actions.ts`'s
 * `deleteIngredient` (docs/stories/S-303). Same per-call `createDb()`
 * pattern as every function above — no module-scope singleton.
 */

/**
 * Wraps `ingredientRepo.getReferencesTo` — the friendly referencing-records
 * pre-check the action runs before attempting a delete (architecture.md §6:
 * "FK RESTRICT violations are pre-empted by an explicit referencing-records
 * query").
 */
export async function getIngredientReferences(
  id: number,
): Promise<{ recipes: Array<{ id: number; name: string }>; inPantry: boolean }> {
  const db = createDb();
  try {
    return await ingredientRepo.getReferencesTo(db, id);
  } finally {
    db.$client.close();
  }
}

/**
 * Wraps `ingredientRepo.remove`. Dumb persistence only — no reference
 * checking here; the calling action owns the pre-check and the FK
 * RESTRICT-as-backstop error handling (architecture.md §6).
 */
export async function removeIngredientRecord(id: number): Promise<void> {
  const db = createDb();
  try {
    await ingredientRepo.remove(db, id);
  } finally {
    db.$client.close();
  }
}

/** openspec: vitamin-tracking — replace-set micronutrient rows + read. */
export async function setIngredientMicronutrients(
  ingredientId: number,
  entries: ingredientRepo.MicronutrientRow[],
): Promise<void> {
  const db = createDb();
  try {
    ingredientRepo.replaceMicronutrients(db, ingredientId, entries);
  } finally {
    db.$client.close();
  }
}

export async function getIngredientMicronutrients(
  ingredientId: number,
): Promise<ingredientRepo.MicronutrientRow[]> {
  const db = createDb();
  try {
    return await ingredientRepo.getMicronutrients(db, ingredientId);
  } finally {
    db.$client.close();
  }
}

/** openspec: ingredient-categories-auto-tags */
export async function setIngredientCategories(ingredientId: number, tags: string[]): Promise<void> {
  const db = createDb();
  try {
    ingredientRepo.replaceCategories(db, ingredientId, tags);
  } finally {
    db.$client.close();
  }
}

export async function getIngredientCategories(ingredientId: number): Promise<string[]> {
  const db = createDb();
  try {
    return await ingredientRepo.getCategories(db, ingredientId);
  } finally {
    db.$client.close();
  }
}

/** openspec: inline-generic-create — exact-name generic lookup for the
 * reuse-or-create path (case-insensitive, same unit class, generics
 * only). */
export async function findGenericByExactName(
  name: string,
  unitClass: "MASS" | "VOLUME" | "COUNT",
): Promise<IngredientRecord | null> {
  const db = createDb();
  try {
    const candidates = await ingredientRepo.searchByName(db, name);
    return (
      candidates.find(
        (candidate) =>
          candidate.name.toLowerCase() === name.toLowerCase() &&
          candidate.genericOfId === null &&
          candidate.unitClass === unitClass,
      ) ?? null
    );
  } finally {
    db.$client.close();
  }
}

/** openspec: category-defaults */
export async function getAllCategoryDefaultsMap(): Promise<Map<string, ingredientRepo.CategoryDefaultsRecord>> {
  const db = createDb();
  try {
    const rows = await ingredientRepo.getAllCategoryDefaults(db);
    return new Map(rows.map((row) => [row.path, row]));
  } finally {
    db.$client.close();
  }
}

export async function saveCategoryDefaults(record: ingredientRepo.CategoryDefaultsRecord): Promise<void> {
  const db = createDb();
  try {
    await ingredientRepo.upsertCategoryDefaults(db, record);
  } finally {
    db.$client.close();
  }
}

export async function removeCategoryDefaults(path: string): Promise<void> {
  const db = createDb();
  try {
    await ingredientRepo.deleteCategoryDefaults(db, path);
  } finally {
    db.$client.close();
  }
}

/** openspec: ratings-variants-links */
export async function setIngredientMerchantLinks(ingredientId: number, urls: string[]): Promise<void> {
  const db = createDb();
  try {
    ingredientRepo.replaceMerchantLinks(db, ingredientId, urls);
  } finally {
    db.$client.close();
  }
}

export async function getIngredientMerchantLinks(ingredientId: number): Promise<string[]> {
  const db = createDb();
  try {
    return await ingredientRepo.getMerchantLinks(db, ingredientId);
  } finally {
    db.$client.close();
  }
}

/** openspec: generic-products */
export async function getGenericLinksMap(): Promise<Map<number, number | null>> {
  const db = createDb();
  try {
    return await ingredientRepo.getGenericLinks(db);
  } finally {
    db.$client.close();
  }
}

export async function getProductsOfGeneric(genericId: number): Promise<Array<{ id: number; name: string }>> {
  const db = createDb();
  try {
    return await ingredientRepo.listProductsOfGeneric(db, genericId);
  } finally {
    db.$client.close();
  }
}

export interface GenericOption {
  id: number;
  name: string;
  unitClass: "MASS" | "VOLUME" | "COUNT";
}

/** openspec: generic-products — pickable generics (no generic link of
 * their own) for the product forms. */
export async function listGenericOptions(): Promise<GenericOption[]> {
  const db = createDb();
  try {
    const all = await ingredientRepo.listAll(db);
    return all
      .filter((record) => record.genericOfId === null)
      .map((record) => ({ id: record.id, name: record.name, unitClass: record.unitClass }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    db.$client.close();
  }
}
