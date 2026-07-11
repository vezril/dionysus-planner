import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

/**
 * Wraps drizzle-orm's programmatic migrator (architecture.md §3 ADR-003,
 * §6 Flow A) — the only migration call site, keeping the drizzle import
 * inside /data/** per the §5 boundary rule. Invoked by instrumentation.ts
 * at boot (S-203) and by `pnpm db:migrate` for manual/CI use.
 */
export function runMigrations(sqlite: Database.Database): void {
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "./drizzle" });
}
