/**
 * Weekly-plan repository (openspec: weekly-planner). Dumb persistence —
 * week math and suggestion logic live in domain/planner.ts.
 */
import { asc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { planEntry, recipe } from "@/data/schema";
import * as schema from "@/data/schema";

type Db = BetterSQLite3Database<typeof schema>;

export interface PlanEntryRecord {
  id: number;
  date: string;
  kind: "cook" | "eat_batch" | "eat_item" | "eat_pantry";
  ingredientId: number | null;
  recipeId: number | null;
  batchId: number | null;
  batchLabel: string | null;
  portions: number;
}

export interface PlanEntryRow extends PlanEntryRecord {
  /** Null for eat_batch entries (they carry batchLabel instead). */
  recipeName: string | null;
  recipeServings: number | null;
}

export async function listForDates(db: Db, dates: string[]): Promise<PlanEntryRow[]> {
  const rows = await db
    .select({
      id: planEntry.id,
      date: planEntry.date,
      kind: planEntry.kind,
      ingredientId: planEntry.ingredientId ?? null,
      recipeId: planEntry.recipeId,
      batchId: planEntry.batchId,
      batchLabel: planEntry.batchLabel,
      portions: planEntry.portions,
      recipeName: recipe.name,
      recipeServings: recipe.servings,
    })
    .from(planEntry)
    .leftJoin(recipe, eq(recipe.id, planEntry.recipeId))
    .where(inArray(planEntry.date, dates))
    .orderBy(asc(planEntry.date), asc(planEntry.id));
  return rows;
}

export interface PlanEntryInsert {
  date: string;
  kind: "cook" | "eat_batch" | "eat_item" | "eat_pantry";
  ingredientId?: number | null;
  recipeId: number | null;
  batchId: number | null;
  batchLabel: string | null;
  portions: number;
}

export async function add(db: Db, input: PlanEntryInsert): Promise<PlanEntryRecord> {
  const [row] = await db
    .insert(planEntry)
    .values({ ...input, createdAt: new Date().toISOString() })
    .returning();
  return {
    id: row.id,
    date: row.date,
    kind: row.kind,
    ingredientId: row.ingredientId,
    recipeId: row.recipeId,
    batchId: row.batchId,
    batchLabel: row.batchLabel,
    portions: row.portions,
  };
}

export async function remove(db: Db, id: number): Promise<boolean> {
  const result = await db.delete(planEntry).where(eq(planEntry.id, id));
  return result.changes > 0;
}

export async function getById(db: Db, id: number): Promise<PlanEntryRecord | null> {
  const [row] = await db.select().from(planEntry).where(eq(planEntry.id, id));
  return row
    ? {
        id: row.id,
        date: row.date,
        kind: row.kind,
        ingredientId: row.ingredientId,
        recipeId: row.recipeId,
        batchId: row.batchId,
        batchLabel: row.batchLabel,
        portions: row.portions,
      }
    : null;
}
