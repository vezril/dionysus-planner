/**
 * Seed-complete health signal (architecture.md §6 Flow A / Risk #6,
 * docs/stories/S-203-seed-mechanism-boot.md AC-6): `/api/health` must
 * never report healthy before migrate+seed has committed (NFR-1 race).
 *
 * Kept in `/data/**` (not `app/api/health/route.ts` itself) per the §5
 * boundary rule — only `/data/**` may import drizzle-orm/better-sqlite3.
 * Opens a fresh connection via `createDb()` on every call (no module-scope
 * singleton) so it always observes the current `DB_PATH`/DB state, then
 * closes it — this runs on every Docker HEALTHCHECK poll (§7), so leaving
 * connections open would leak file descriptors over time.
 */
import { createDb } from "@/data/db";
import { ingredient } from "@/data/schema";
import seedData from "@/data/seed/seed-data.json";

const EXPECTED_MINIMUM_INGREDIENT_COUNT = (seedData as unknown[]).length;

/**
 * True once the `ingredient` table exists AND holds at least as many rows
 * as the seed file — i.e. migrations have applied and the seed transaction
 * has committed. Returns `false` (never throws) for any pre-migration
 * state, e.g. a missing DB file or a missing `ingredient` table.
 */
export function isSeedComplete(): boolean {
  const db = createDb();
  try {
    const rows = db.select({ id: ingredient.id }).from(ingredient).all();
    return rows.length >= EXPECTED_MINIMUM_INGREDIENT_COUNT;
  } catch {
    return false;
  } finally {
    db.$client.close();
  }
}
