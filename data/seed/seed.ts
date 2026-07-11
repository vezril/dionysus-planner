/**
 * Idempotent, override-preserving seed runner (architecture.md §6 Flow A /
 * §8). Upserts `data/seed/seed-data.json`-shaped rows into `ingredient`,
 * keyed by `seedKey` (never `name` or DB `id` — a rename must not break
 * idempotency, architecture.md §8):
 *
 *   for each row (keyed by seedKey):
 *     existing = SELECT * FROM ingredient WHERE seedKey = row.seedKey
 *     if not existing:                      INSERT (source='SEEDED', overridden=false)
 *     else if existing.overridden == false:  UPDATE <nutrition fields> only
 *     else (existing.overridden == true):    skip entirely
 *
 * The whole batch runs inside a single, synchronous better-sqlite3
 * transaction (see the comment on this pattern in
 * data/repositories/recipeRepo.ts): `Database#transaction`'s callback must
 * not be `async`/contain `await`, so every read/write below is forced
 * synchronous via `.all()`/`.run()` rather than the default thenable
 * (Promise-wrapping) query-builder API. A thrown error (e.g. a NOT NULL
 * constraint violation on a malformed row) rolls back every row from that
 * call, not just the offending one.
 *
 * Can also be run directly (`pnpm db:seed` / `tsx data/seed/seed.ts`)
 * against `DB_PATH` for manual/CI use (docs/stories/S-203 task list).
 */
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { ingredient } from "@/data/schema";
import * as schema from "@/data/schema";

export interface SeedRow {
  seedKey: string;
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
}

type Db = BetterSQLite3Database<typeof schema>;

function nowIso(): string {
  return new Date().toISOString();
}

export async function seed(db: Db, rows: SeedRow[]): Promise<void> {
  db.transaction((tx) => {
    for (const row of rows) {
      const [existing] = tx.select().from(ingredient).where(eq(ingredient.seedKey, row.seedKey)).all();

      if (!existing) {
        const timestamp = nowIso();
        tx.insert(ingredient)
          .values({
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
            source: "SEEDED",
            overridden: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .run();
        continue;
      }

      if (existing.overridden) {
        continue;
      }

      tx.update(ingredient)
        .set({
          densityGPerMl: row.densityGPerMl,
          caloriesPerRef: row.caloriesPerRef,
          proteinPerRef: row.proteinPerRef,
          carbsPerRef: row.carbsPerRef,
          fatPerRef: row.fatPerRef,
          fiberPerRef: row.fiberPerRef,
          sugarPerRef: row.sugarPerRef,
          sodiumMgPerRef: row.sodiumMgPerRef,
          updatedAt: nowIso(),
        })
        .where(eq(ingredient.seedKey, row.seedKey))
        .run();
    }
  });
}

/**
 * CLI entry point (`pnpm db:seed`): seeds `DB_PATH` (or the dev default)
 * from the real `data/seed/seed-data.json`. Not exercised by the test
 * suite (see `data/bootstrap.ts` / `instrumentation.ts` for the boot-time
 * path) — only invoked when this file is run directly, e.g. via `tsx`.
 */
async function main() {
  const [{ createDb }, seedDataModule] = await Promise.all([
    import("@/data/db"),
    import("@/data/seed/seed-data.json"),
  ]);
  const db = createDb();
  const rows = (seedDataModule.default ?? seedDataModule) as unknown as SeedRow[];
  await seed(db, rows);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
