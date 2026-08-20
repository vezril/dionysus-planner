/**
 * Weekly-plan repository (openspec: weekly-planner). Dumb persistence —
 * week math and suggestion logic live in domain/planner.ts.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { planEntry, recipe } from "@/data/schema";
import * as schema from "@/data/schema";

type Db = BetterSQLite3Database<typeof schema>;

export interface PlanEntryRecord {
  id: number;
  date: string;
  recipeId: number;
  portions: number;
}

export interface PlanEntryRow extends PlanEntryRecord {
  recipeName: string;
  recipeServings: number;
}

export async function listForDates(db: Db, dates: string[]): Promise<PlanEntryRow[]> {
  const rows = await db
    .select({
      id: planEntry.id,
      date: planEntry.date,
      recipeId: planEntry.recipeId,
      portions: planEntry.portions,
      recipeName: recipe.name,
      recipeServings: recipe.servings,
    })
    .from(planEntry)
    .innerJoin(recipe, eq(recipe.id, planEntry.recipeId))
    .where(inArray(planEntry.date, dates))
    .orderBy(asc(planEntry.date), asc(planEntry.id));
  return rows;
}

export async function add(db: Db, input: { date: string; recipeId: number; portions: number }): Promise<PlanEntryRecord> {
  const [row] = await db
    .insert(planEntry)
    .values({ ...input, createdAt: new Date().toISOString() })
    .returning();
  return { id: row.id, date: row.date, recipeId: row.recipeId, portions: row.portions };
}

export async function remove(db: Db, id: number): Promise<boolean> {
  const result = await db.delete(planEntry).where(eq(planEntry.id, id));
  return result.changes > 0;
}

export async function getById(db: Db, id: number): Promise<PlanEntryRecord | null> {
  const [row] = await db
    .select()
    .from(planEntry)
    .where(and(eq(planEntry.id, id), eq(planEntry.id, id)));
  return row ? { id: row.id, date: row.date, recipeId: row.recipeId, portions: row.portions } : null;
}
