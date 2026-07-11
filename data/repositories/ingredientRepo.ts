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
  source: "SEEDED" | "CUSTOM";
  overridden: boolean;
  createdAt: string;
  updatedAt: string;
}

export type IngredientCreateInput = Omit<IngredientRecord, "id" | "createdAt" | "updatedAt" | "overridden"> & {
  overridden?: boolean;
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
    | "overridden"
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
    source: row.source,
    overridden: row.overridden,
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
      source: input.source,
      overridden: input.overridden ?? false,
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
