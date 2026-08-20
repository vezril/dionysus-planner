/**
 * Nutrition-targets facade (openspec: nutrition-targets-guide). Rows exist
 * only for overridden values; resolveTargets merges over code defaults.
 */
import { eq } from "drizzle-orm";
import { createDb } from "@/data/db";
import { nutritionTarget } from "@/data/schema";
import { resolveTargets, type ResolvedTargets } from "@/domain/nutritionTargets";

export async function getResolvedTargets(): Promise<ResolvedTargets> {
  const db = createDb();
  try {
    const rows = await db.select().from(nutritionTarget);
    return resolveTargets(rows);
  } finally {
    db.$client.close();
  }
}

export async function upsertTargets(entries: Array<{ key: string; value: number }>): Promise<void> {
  const db = createDb();
  try {
    db.$client.transaction(() => {
      for (const entry of entries) {
        db.$client
          .prepare(
            "INSERT INTO nutrition_target (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          )
          .run(entry.key, entry.value);
      }
    })();
  } finally {
    db.$client.close();
  }
}

export async function resetTarget(key: string): Promise<void> {
  const db = createDb();
  try {
    await db.delete(nutritionTarget).where(eq(nutritionTarget.key, key));
  } finally {
    db.$client.close();
  }
}
