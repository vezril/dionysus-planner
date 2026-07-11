import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/**
 * Opens the SQLite connection (architecture.md §7): WAL mode + foreign
 * key enforcement on every open. Connection wiring only, no business
 * logic — default `DB_PATH` resolution, the dev `.dev-data/` directory
 * creation, and the instrumentation.ts boot hook land in S-201/S-203.
 */
export function createDb(path: string) {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}
