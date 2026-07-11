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

/**
 * CLI entry point (`pnpm db:migrate`): applies migrations to `DB_PATH` (or
 * the dev fallback) for manual/CI use (architecture.md §7 "Local
 * development workflow"). Not exercised by the test suite — only invoked
 * when this file is run directly, e.g. via `tsx`.
 */
async function main() {
  const { createDb } = await import("@/data/db");
  const db = createDb();
  try {
    runMigrations(db.$client);
  } finally {
    db.$client.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
