/**
 * Recipe repository — the single joined queries Flow B (nutrition) and
 * Flow C/D (matching/list) rely on, plus transactional multi-row writes
 * (architecture.md §6). Repos are dumb persistence: no validation, no
 * nutrition/matching computation here (docs/stories/S-202-repositories.md
 * Dev Notes).
 *
 * `getWithLinesAndIngredients` / `getAllWithLines` each issue exactly one
 * SQL statement (a single join) — verified by tests/integration/
 * repositories/queryCount.test.ts's prepared-statement spy (AC-4, NFR-3).
 * `db.transaction(...)` callbacks below are deliberately synchronous (no
 * `await` inside): better-sqlite3's native transaction wrapper
 * (`Database#transaction`) executes its callback fully synchronously and
 * commits immediately on return, so an `async` callback would return a
 * pending Promise before its awaited work actually ran, breaking the
 * atomicity this repository is supposed to provide.
 */
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { ingredient, recipe, recipeLine } from "@/data/schema";
import * as schema from "@/data/schema";
import type { UnitClass } from "@/domain/types";
import type { IngredientRecord } from "@/data/repositories/ingredientRepo";

type Db = BetterSQLite3Database<typeof schema>;

export interface RecipeLineInput {
  ingredientId: number;
  quantityCanonical: number;
  entryUnitClass: UnitClass;
  displayQuantity: number;
  displayUnit: string;
}

export interface RecipeLineRecord extends RecipeLineInput {
  id: number;
  recipeId: number;
}

export interface RecipeRecord {
  id: number;
  name: string;
  servings: number;
  instructions: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeWriteInput {
  name: string;
  servings: number;
  instructions: string;
  lines: RecipeLineInput[];
}

export interface RecipeUpdateInput {
  name?: string;
  servings?: number;
  instructions?: string;
  lines: RecipeLineInput[];
}

export interface DensityIngredientProjection {
  unitClass: UnitClass;
  densityGPerMl: number | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toRecipeRecord(row: typeof recipe.$inferSelect): RecipeRecord {
  return {
    id: row.id,
    name: row.name,
    servings: row.servings,
    instructions: row.instructions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLineRecord(row: typeof recipeLine.$inferSelect): RecipeLineRecord {
  return {
    id: row.id,
    recipeId: row.recipeId,
    ingredientId: row.ingredientId,
    quantityCanonical: row.quantityCanonical,
    entryUnitClass: row.entryUnitClass,
    displayQuantity: row.displayQuantity,
    displayUnit: row.displayUnit,
  };
}

function toIngredientRecord(row: typeof ingredient.$inferSelect): IngredientRecord {
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

export async function getById(db: Db, id: number): Promise<RecipeRecord | null> {
  const [row] = await db.select().from(recipe).where(eq(recipe.id, id));
  return row ? toRecipeRecord(row) : null;
}

export async function createWithLines(
  db: Db,
  input: RecipeWriteInput,
): Promise<RecipeRecord & { lines: RecipeLineRecord[] }> {
  return db.transaction((tx) => {
    const timestamp = nowIso();
    const [recipeRow] = tx
      .insert(recipe)
      .values({
        name: input.name,
        servings: input.servings,
        instructions: input.instructions,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning()
      .all();

    const lines = input.lines.map((line) => {
      const [lineRow] = tx
        .insert(recipeLine)
        .values({
          recipeId: recipeRow.id,
          ingredientId: line.ingredientId,
          quantityCanonical: line.quantityCanonical,
          entryUnitClass: line.entryUnitClass,
          displayQuantity: line.displayQuantity,
          displayUnit: line.displayUnit,
        })
        .returning()
        .all();
      return toLineRecord(lineRow);
    });

    return { ...toRecipeRecord(recipeRow), lines };
  });
}

export async function getWithLinesAndIngredients(
  db: Db,
  id: number,
): Promise<(RecipeRecord & { lines: Array<RecipeLineRecord & { ingredient: IngredientRecord }> }) | null> {
  const rows = await db
    .select({ recipe, line: recipeLine, ingredient })
    .from(recipe)
    .leftJoin(recipeLine, eq(recipeLine.recipeId, recipe.id))
    .leftJoin(ingredient, eq(ingredient.id, recipeLine.ingredientId))
    .where(eq(recipe.id, id));

  if (rows.length === 0) {
    return null;
  }

  const lines = rows
    .filter((row) => row.line !== null && row.ingredient !== null)
    .map((row) => ({
      ...toLineRecord(row.line!),
      ingredient: toIngredientRecord(row.ingredient!),
    }));

  return { ...toRecipeRecord(rows[0].recipe), lines };
}

export async function getAllWithLines(
  db: Db,
): Promise<Array<RecipeRecord & { lines: Array<RecipeLineRecord & { ingredient: DensityIngredientProjection }> }>> {
  const rows = await db
    .select({
      recipe,
      line: recipeLine,
      ingredientUnitClass: ingredient.unitClass,
      ingredientDensity: ingredient.densityGPerMl,
    })
    .from(recipe)
    .leftJoin(recipeLine, eq(recipeLine.recipeId, recipe.id))
    .leftJoin(ingredient, eq(ingredient.id, recipeLine.ingredientId));

  const byId = new Map<
    number,
    RecipeRecord & { lines: Array<RecipeLineRecord & { ingredient: DensityIngredientProjection }> }
  >();

  for (const row of rows) {
    let entry = byId.get(row.recipe.id);
    if (!entry) {
      entry = { ...toRecipeRecord(row.recipe), lines: [] };
      byId.set(row.recipe.id, entry);
    }
    if (row.line !== null) {
      entry.lines.push({
        ...toLineRecord(row.line),
        ingredient: { unitClass: row.ingredientUnitClass!, densityGPerMl: row.ingredientDensity ?? null },
      });
    }
  }

  return [...byId.values()];
}

export async function updateWithLines(
  db: Db,
  id: number,
  input: RecipeUpdateInput,
): Promise<RecipeRecord & { lines: RecipeLineRecord[] }> {
  return db.transaction((tx) => {
    const patch: Partial<typeof recipe.$inferInsert> = { updatedAt: nowIso() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.servings !== undefined) patch.servings = input.servings;
    if (input.instructions !== undefined) patch.instructions = input.instructions;

    const [recipeRow] = tx.update(recipe).set(patch).where(eq(recipe.id, id)).returning().all();

    tx.delete(recipeLine).where(eq(recipeLine.recipeId, id)).run();

    const lines = input.lines.map((line) => {
      const [lineRow] = tx
        .insert(recipeLine)
        .values({
          recipeId: id,
          ingredientId: line.ingredientId,
          quantityCanonical: line.quantityCanonical,
          entryUnitClass: line.entryUnitClass,
          displayQuantity: line.displayQuantity,
          displayUnit: line.displayUnit,
        })
        .returning()
        .all();
      return toLineRecord(lineRow);
    });

    return { ...toRecipeRecord(recipeRow), lines };
  });
}

export async function remove(db: Db, id: number): Promise<void> {
  await db.delete(recipe).where(eq(recipe.id, id));
}
