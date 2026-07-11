import Database from "better-sqlite3";
import { runMigrations } from "@/data/migrate";

/**
 * Test-only helper (S-201): opens a fresh in-memory SQLite database, applies
 * the real migrations through data/migrate.ts's `runMigrations`, and turns on
 * foreign-key enforcement — mirroring what data/db.ts's connection factory
 * does on every open (architecture.md §7). SQLite enforces `foreign_keys`
 * per-connection and it defaults OFF, so schema-level RESTRICT/CASCADE
 * behavior cannot be exercised without explicitly enabling it here.
 *
 * Returns the raw better-sqlite3 handle (not a Drizzle wrapper) so tests can
 * assert directly against the schema via PRAGMA introspection and raw SQL —
 * pinning the SCHEMA, not Drizzle's query-builder behavior (per this story's
 * test strategy).
 */
export function createMigratedMemoryDb(): Database.Database {
  const sqlite = new Database(":memory:");
  runMigrations(sqlite);
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

export interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

export interface ForeignKeyRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

interface IndexInfoRow {
  seqno: number;
  cid: number;
  name: string;
}

export function tableColumns(sqlite: Database.Database, table: string): TableInfoRow[] {
  return sqlite.prepare(`PRAGMA table_info(${table})`).all() as TableInfoRow[];
}

export function requireColumn(cols: TableInfoRow[], name: string): TableInfoRow {
  const col = cols.find((c) => c.name === name);
  if (!col) {
    throw new Error(`expected column "${name}" not found (have: ${cols.map((c) => c.name).join(", ")})`);
  }
  return col;
}

export function foreignKeys(sqlite: Database.Database, table: string): ForeignKeyRow[] {
  return sqlite.prepare(`PRAGMA foreign_key_list(${table})`).all() as ForeignKeyRow[];
}

/** Returns the set of unique (non-PK) column groups declared on a table, sorted by position within each index. */
export function uniqueColumnSets(sqlite: Database.Database, table: string): string[][] {
  const indexes = sqlite.prepare(`PRAGMA index_list(${table})`).all() as IndexListRow[];
  return indexes
    .filter((idx) => idx.unique === 1)
    .map((idx) =>
      (sqlite.prepare(`PRAGMA index_info(${idx.name})`).all() as IndexInfoRow[])
        .sort((a, b) => a.seqno - b.seqno)
        .map((c) => c.name),
    );
}

export function tableNames(sqlite: Database.Database): string[] {
  return (
    sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as Array<{ name: string }>
  ).map((r) => r.name);
}
