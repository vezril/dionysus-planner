/**
 * Boot orchestration (architecture.md §6 Flow A ordering): migrate, then
 * seed. Kept as a plain, dependency-injected function — rather than only
 * inline in the Next.js-only `instrumentation.ts` — so Flow A's ordering
 * is directly unit/integration-testable without booting Next.js itself
 * (docs/stories/S-203-seed-mechanism-boot.md).
 *
 * `instrumentation.ts#register()` is expected to call only this function
 * (or the two /data entry points it wraps) inside its
 * `NEXT_RUNTIME === 'nodejs'` guard — never import drizzle itself (§5
 * boundary rule).
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { runMigrations } from "@/data/migrate";
import { seed, type SeedRow } from "@/data/seed/seed";
import * as schema from "@/data/schema";

/**
 * Step 1: apply migrations (creates the schema on a fresh DB, applies only
 * pending migrations on an existing one). Step 2: seed. Safe to call twice
 * on the same connection — both steps are idempotent by construction (dev
 * hot-reload may re-invoke `instrumentation.ts#register()` more than
 * once).
 */
export async function bootstrap(sqlite: Database.Database, rows: SeedRow[]): Promise<void> {
  runMigrations(sqlite);
  const db = drizzle(sqlite, { schema });
  await seed(db, rows);
}
