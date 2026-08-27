/**
 * Weekly-plan repository (openspec: weekly-planner). Dumb persistence —
 * week math and suggestion logic live in domain/planner.ts.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { ingredient, planEntry, recipe } from "@/data/schema";
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
  /** openspec: planner-consume — null while still an intention. */
  consumedAt: string | null;
}

export interface PlanEntryRow extends PlanEntryRecord {
  /** Null for eat_batch entries (they carry batchLabel instead). */
  recipeName: string | null;
  recipeServings: number | null;
  /** openspec: planner-consume — drives the Eat vs Drink verb. */
  ingredientCategory: "FOOD" | "DRINK" | "SUPPLEMENT" | null;
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
      consumedAt: planEntry.consumedAt,
      recipeName: recipe.name,
      recipeServings: recipe.servings,
      ingredientCategory: ingredient.category,
    })
    .from(planEntry)
    .leftJoin(recipe, eq(recipe.id, planEntry.recipeId))
    .leftJoin(ingredient, eq(ingredient.id, planEntry.ingredientId))
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

function toRecord(row: typeof planEntry.$inferSelect): PlanEntryRecord {
  return {
    id: row.id,
    date: row.date,
    kind: row.kind,
    ingredientId: row.ingredientId,
    recipeId: row.recipeId,
    batchId: row.batchId,
    batchLabel: row.batchLabel,
    portions: row.portions,
    consumedAt: row.consumedAt,
  };
}

export async function add(db: Db, input: PlanEntryInsert): Promise<PlanEntryRecord> {
  const [row] = await db
    .insert(planEntry)
    .values({ ...input, createdAt: new Date().toISOString() })
    .returning();
  return toRecord(row);
}

export async function remove(db: Db, id: number): Promise<boolean> {
  const result = await db.delete(planEntry).where(eq(planEntry.id, id));
  return result.changes > 0;
}

export async function getById(db: Db, id: number): Promise<PlanEntryRecord | null> {
  const [row] = await db.select().from(planEntry).where(eq(planEntry.id, id));
  return row ? toRecord(row) : null;
}

/** openspec: planner-consume — flip an intention to eaten. Returns false
 * when the entry is missing OR already consumed (idempotence guard). */
export async function markConsumed(db: Db, id: number, consumedAt: string): Promise<boolean> {
  const result = await db
    .update(planEntry)
    .set({ consumedAt })
    .where(and(eq(planEntry.id, id), isNull(planEntry.consumedAt)));
  return result.changes > 0;
}

/** openspec: planner-consume — every still-reserving batch plan (any
 * date): availability = service remaining − these portions. */
export async function listUnconsumedBatchPlans(
  db: Db,
): Promise<Array<{ batchId: number; portions: number }>> {
  const rows = await db
    .select({ batchId: planEntry.batchId, portions: planEntry.portions })
    .from(planEntry)
    .where(and(eq(planEntry.kind, "eat_batch"), isNull(planEntry.consumedAt)));
  return rows.filter((row): row is { batchId: number; portions: number } => row.batchId !== null);
}

/** openspec: backup-export — every plan entry, oldest first. */
export async function getAllEntries(db: Db): Promise<PlanEntryRecord[]> {
  const rows = await db.select().from(schema.planEntry).orderBy(schema.planEntry.date);
  return rows.map(toRecord);
}
