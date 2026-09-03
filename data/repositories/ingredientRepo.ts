/**
 * Ingredient repository — maps DB rows <-> plain domain-shaped records
 * (architecture.md §5). Repos are dumb persistence: no validation, no
 * business rules (docs/stories/S-202-repositories.md Dev Notes). All
 * lookups here are ID- or explicit-substring-based, never fuzzy (FR-24).
 */
import { eq, like } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { ingredient, recipe, recipeLine, pantryItem } from "@/data/schema";
import * as schema from "@/data/schema";

type Db = BetterSQLite3Database<typeof schema>;

export interface IngredientRecord {
  id: number;
  seedKey: string | null;
  name: string;
  unitClass: "MASS" | "VOLUME" | "COUNT";
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
  source: "SEEDED" | "CUSTOM";
  category: "FOOD" | "DRINK" | "SUPPLEMENT";
  shelfLifeDays: number | null;
  genericOfId: number | null;
  readyToEat: boolean;
  overridden: boolean;
  // openspec: custom-pantry-items — optional product identity (design.md D1).
  brand: string | null;
  barcode: string | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  /** openspec: pack-units — the inner pre-portioned pack. */
  packQuantity: number | null;
  packUnit: string | null;
  /** openspec: ariadne-product-ref — Ariadne Product Catalog id; null is
   * permanently legitimate and nothing meal-shaped may require it. */
  productId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type IngredientCreateInput = Omit<
  IngredientRecord,
  "id" | "createdAt" | "updatedAt" | "overridden" | "brand" | "barcode" | "packageQuantity" | "packageUnit" | "packQuantity" | "packUnit" | "productId"
> & {
  overridden?: boolean;
  // Optional so pre-existing callers (seed, ingredient actions) are untouched.
  brand?: string | null;
  barcode?: string | null;
  packageQuantity?: number | null;
  packageUnit?: string | null;
  packQuantity?: number | null;
  packUnit?: string | null;
  productId?: string | null;
};

export type IngredientUpdatePatch = Partial<
  Pick<
    IngredientRecord,
    | "name"
    | "densityGPerMl"
    | "caloriesPerRef"
    | "proteinPerRef"
    | "carbsPerRef"
    | "fatPerRef"
    | "fiberPerRef"
    | "sugarPerRef"
    | "category"
    | "shelfLifeDays"
    | "genericOfId"
    | "readyToEat"
    | "sodiumMgPerRef"
    | "alcoholGPerRef"
    | "saturatedFatGPerRef"
    | "transFatGPerRef"
    | "cholesterolMgPerRef"
    | "overridden"
    | "brand"
    | "barcode"
    | "packageQuantity"
    | "packageUnit"
    | "packQuantity"
    | "packUnit"
    | "productId"
  >
>;

function toRecord(row: typeof ingredient.$inferSelect): IngredientRecord {
  return {
    id: row.id,
    seedKey: row.seedKey,
    name: row.name,
    unitClass: row.unitClass,
    densityGPerMl: row.densityGPerMl,
    caloriesPerRef: row.caloriesPerRef,
    proteinPerRef: row.proteinPerRef,
    carbsPerRef: row.carbsPerRef,
    fatPerRef: row.fatPerRef,
    fiberPerRef: row.fiberPerRef,
    sugarPerRef: row.sugarPerRef,
    sodiumMgPerRef: row.sodiumMgPerRef,
    alcoholGPerRef: row.alcoholGPerRef,
    saturatedFatGPerRef: row.saturatedFatGPerRef,
    transFatGPerRef: row.transFatGPerRef,
    cholesterolMgPerRef: row.cholesterolMgPerRef,
    category: row.category,
    shelfLifeDays: row.shelfLifeDays,
    genericOfId: row.genericOfId,
    readyToEat: row.readyToEat,
    source: row.source,
    overridden: row.overridden,
    brand: row.brand,
    barcode: row.barcode,
    packageQuantity: row.packageQuantity,
    packageUnit: row.packageUnit,
    packQuantity: row.packQuantity,
    packUnit: row.packUnit,
    productId: row.productId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function create(db: Db, input: IngredientCreateInput): Promise<IngredientRecord> {
  const timestamp = nowIso();
  const [row] = await db
    .insert(ingredient)
    .values({
      seedKey: input.seedKey,
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
      genericOfId: input.genericOfId,
      readyToEat: input.readyToEat,
      source: input.source,
      overridden: input.overridden ?? false,
      brand: input.brand ?? null,
      barcode: input.barcode ?? null,
      packageQuantity: input.packageQuantity ?? null,
      packageUnit: input.packageUnit ?? null,
      packQuantity: input.packQuantity ?? null,
      packUnit: input.packUnit ?? null,
      productId: input.productId ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning();
  return toRecord(row);
}

export async function getById(db: Db, id: number): Promise<IngredientRecord | null> {
  const [row] = await db.select().from(ingredient).where(eq(ingredient.id, id));
  return row ? toRecord(row) : null;
}

export async function listAll(db: Db): Promise<IngredientRecord[]> {
  const rows = await db.select().from(ingredient);
  return rows.map(toRecord);
}

export async function searchByName(db: Db, query: string): Promise<IngredientRecord[]> {
  const rows = await db.select().from(ingredient).where(like(ingredient.name, `%${query}%`));
  return rows.map(toRecord);
}

/** openspec: custom-pantry-items — exact-match barcode lookup: the duplicate
 * pre-check today, the scanner app's resolution path later. */
export async function getByBarcode(db: Db, barcode: string): Promise<IngredientRecord | null> {
  const [row] = await db.select().from(ingredient).where(eq(ingredient.barcode, barcode));
  return row ? toRecord(row) : null;
}

export async function update(db: Db, id: number, patch: IngredientUpdatePatch): Promise<IngredientRecord> {
  const [row] = await db
    .update(ingredient)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(ingredient.id, id))
    .returning();
  return toRecord(row);
}

export interface IngredientReferences {
  recipes: Array<{ id: number; name: string }>;
  inPantry: boolean;
}

export async function getReferencesTo(db: Db, id: number): Promise<IngredientReferences> {
  const referencingRecipes = await db
    .selectDistinct({ id: recipe.id, name: recipe.name })
    .from(recipeLine)
    .innerJoin(recipe, eq(recipeLine.recipeId, recipe.id))
    .where(eq(recipeLine.ingredientId, id));

  const [pantryRow] = await db.select({ id: pantryItem.id }).from(pantryItem).where(eq(pantryItem.ingredientId, id));

  return {
    recipes: referencingRecipes,
    inPantry: pantryRow !== undefined,
  };
}

export async function remove(db: Db, id: number): Promise<void> {
  await db.delete(ingredient).where(eq(ingredient.id, id));
}

/** openspec: vitamin-tracking — sparse micronutrient rows. Replace-set
 * writes (same posture as recipe tags); reads return entries in registry
 * insertion-agnostic key order (sorted for stability). */
export interface MicronutrientRow {
  key: string;
  amountPerRef: number;
}

export async function getMicronutrients(db: Db, ingredientId: number): Promise<MicronutrientRow[]> {
  const rows = await db
    .select()
    .from(schema.ingredientMicronutrient)
    .where(eq(schema.ingredientMicronutrient.ingredientId, ingredientId));
  return rows
    .map((row) => ({ key: row.nutrientKey, amountPerRef: row.amountPerRef }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function replaceMicronutrients(db: Db, ingredientId: number, entries: MicronutrientRow[]): void {
  db.transaction((tx) => {
    tx.delete(schema.ingredientMicronutrient)
      .where(eq(schema.ingredientMicronutrient.ingredientId, ingredientId))
      .run();
    for (const entry of entries) {
      tx.insert(schema.ingredientMicronutrient)
        .values({ ingredientId, nutrientKey: entry.key, amountPerRef: entry.amountPerRef })
        .run();
    }
  });
}

/** openspec: ingredient-categories-auto-tags — replace-set category
 * labels, same posture as replaceMicronutrients. */
export function replaceCategories(db: Db, ingredientId: number, tags: string[]): void {
  db.transaction((tx) => {
    tx.delete(schema.ingredientTag).where(eq(schema.ingredientTag.ingredientId, ingredientId)).run();
    for (const tag of tags) {
      tx.insert(schema.ingredientTag).values({ ingredientId, tag }).run();
    }
  });
}

export async function getCategories(db: Db, ingredientId: number): Promise<string[]> {
  const rows = await db
    .select({ tag: schema.ingredientTag.tag })
    .from(schema.ingredientTag)
    .where(eq(schema.ingredientTag.ingredientId, ingredientId));
  return rows.map((row) => row.tag);
}

export async function getAllCategories(db: Db): Promise<Map<number, string[]>> {
  const rows = await db
    .select({ ingredientId: schema.ingredientTag.ingredientId, tag: schema.ingredientTag.tag })
    .from(schema.ingredientTag);
  const byIngredientId = new Map<number, string[]>();
  for (const row of rows) {
    const existing = byIngredientId.get(row.ingredientId);
    if (existing) existing.push(row.tag);
    else byIngredientId.set(row.ingredientId, [row.tag]);
  }
  return byIngredientId;
}

/** openspec: ratings-variants-links — merchant URLs, replace-set. */
export function replaceMerchantLinks(db: Db, ingredientId: number, urls: string[]): void {
  db.transaction((tx) => {
    tx.delete(schema.ingredientLink).where(eq(schema.ingredientLink.ingredientId, ingredientId)).run();
    for (const url of urls) {
      tx.insert(schema.ingredientLink).values({ ingredientId, url }).run();
    }
  });
}

export async function getMerchantLinks(db: Db, ingredientId: number): Promise<string[]> {
  const rows = await db
    .select({ url: schema.ingredientLink.url })
    .from(schema.ingredientLink)
    .where(eq(schema.ingredientLink.ingredientId, ingredientId));
  return rows.map((row) => row.url);
}

/** openspec: category-defaults — path-keyed nutrition defaults. */
export interface CategoryDefaultsRecord {
  path: string;
  displayPath: string;
  caloriesPerRef: number | null;
  proteinPerRef: number | null;
  carbsPerRef: number | null;
  fatPerRef: number | null;
  alcoholAbvPercent: number | null;
}

export async function getAllCategoryDefaults(db: Db): Promise<CategoryDefaultsRecord[]> {
  return db.select().from(schema.categoryNutrition);
}

export async function upsertCategoryDefaults(db: Db, record: CategoryDefaultsRecord): Promise<void> {
  await db
    .insert(schema.categoryNutrition)
    .values(record)
    .onConflictDoUpdate({ target: schema.categoryNutrition.path, set: record });
}

export async function deleteCategoryDefaults(db: Db, path: string): Promise<void> {
  await db.delete(schema.categoryNutrition).where(eq(schema.categoryNutrition.path, path));
}

/** openspec: backup-export — all merchant links in one query. */
export async function getAllMerchantLinks(db: Db): Promise<Map<number, string[]>> {
  const rows = await db
    .select({ ingredientId: schema.ingredientLink.ingredientId, url: schema.ingredientLink.url })
    .from(schema.ingredientLink);
  const byIngredientId = new Map<number, string[]>();
  for (const row of rows) {
    const existing = byIngredientId.get(row.ingredientId);
    if (existing) existing.push(row.url);
    else byIngredientId.set(row.ingredientId, [row.url]);
  }
  return byIngredientId;
}

/** openspec: generic-products — id → genericOfId for every ingredient
 * (group-root resolution) plus products linked to a given generic. */
export async function getGenericLinks(db: Db): Promise<Map<number, number | null>> {
  const rows = await db.select({ id: ingredient.id, genericOfId: ingredient.genericOfId }).from(ingredient);
  return new Map(rows.map((row) => [row.id, row.genericOfId]));
}

export async function listProductsOfGeneric(db: Db, genericId: number): Promise<Array<{ id: number; name: string }>> {
  const rows = await db
    .select({ id: ingredient.id, name: ingredient.name })
    .from(ingredient)
    .where(eq(ingredient.genericOfId, genericId));
  return rows;
}
