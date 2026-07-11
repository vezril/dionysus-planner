import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DEFAULT_DB_PATH = "./.dev-data/dionysus.db";

/**
 * Resolves the on-disk DB path (architecture.md §7): `DB_PATH` env var
 * when set, otherwise the dev fallback `./.dev-data/dionysus.db`
 * (relative to the current working directory).
 */
function resolveDbPath(path?: string): string {
  return path ?? process.env.DB_PATH ?? DEFAULT_DB_PATH;
}

/**
 * Opens the SQLite connection (architecture.md §7): WAL mode + foreign
 * key enforcement on every open. `:memory:` is passed straight through
 * (no directory to create). For any file-based path — explicit or
 * resolved from `DB_PATH`/the dev fallback — the containing directory is
 * created (recursively) before opening, so a fresh checkout's
 * `./.dev-data/` (gitignored) is created automatically.
 */
export function createDb(path?: string) {
  const resolvedPath = resolveDbPath(path);

  if (resolvedPath !== ":memory:") {
    const dir = dirname(resolve(resolvedPath));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(resolvedPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}
