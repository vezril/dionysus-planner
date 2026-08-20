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
  source: "SEEDED" | "CUSTOM";
  overridden: boolean;
  // openspec: custom-pantry-items — optional product identity (design.md D1).
  brand: string | null;
  barcode: string | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  createdAt: string;
  updatedAt: string;
}

export type IngredientCreateInput = Omit<
  IngredientRecord,
  "id" | "createdAt" | "updatedAt" | "overridden" | "brand" | "barcode" | "packageQuantity" | "packageUnit"
> & {
  overridden?: boolean;
  // Optional so pre-existing callers (seed, ingredient actions) are untouched.
  brand?: string | null;
  barcode?: string | null;
  packageQuantity?: number | null;
  packageUnit?: string | null;
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
    | "sodiumMgPerRef"
    | "alcoholGPerRef"
    | "overridden"
    | "brand"
    | "barcode"
    | "packageQuantity"
    | "packageUnit"
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
    source: row.source,
    overridden: row.overridden,
    brand: row.brand,
    barcode: row.barcode,
    packageQuantity: row.packageQuantity,
    packageUnit: row.packageUnit,
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
      source: input.source,
      overridden: input.overridden ?? false,
      brand: input.brand ?? null,
      barcode: input.barcode ?? null,
      packageQuantity: input.packageQuantity ?? null,
      packageUnit: input.packageUnit ?? null,
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
