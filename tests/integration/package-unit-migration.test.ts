import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient } from "./support/rawFixtures";

/**
 * openspec: count-via-package-size — the 0003 data migration normalizes
 * legacy free-text packageUnit values that case-insensitively match a known
 * unit key, and leaves everything else alone. Rows are inserted AFTER
 * runMigrations (a fresh DB is already fully migrated), then the 0003 SQL
 * is re-applied directly — UPDATEs are idempotent, so re-running is exactly
 * the semantics under test.
 */
describe("packageUnit normalization migration", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-pkg-unit-migration-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;

    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);
    setupSqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  function applyNormalization(sqlite: Database.Database) {
    const sql = readFileSync("drizzle/0003_normalize_package_unit.sql", "utf-8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) sqlite.exec(trimmed);
    }
  }

  it("normalizes case-variants ('ml' → 'mL', 'G' → 'g') and leaves valid keys and junk alone", () => {
    const sqlite = new Database(dbPath);
    const legacyMl = insertRawIngredient(sqlite, { name: "Legacy soda", packageQuantity: 355, packageUnit: "ml" });
    const legacyG = insertRawIngredient(sqlite, { name: "Legacy crackers", packageQuantity: 200, packageUnit: "G" });
    const alreadyOk = insertRawIngredient(sqlite, { name: "Fine soda", packageQuantity: 355, packageUnit: "mL" });
    const junk = insertRawIngredient(sqlite, { name: "Junk unit", packageQuantity: 1, packageUnit: "can" });
    const noPackage = insertRawIngredient(sqlite, { name: "No package" });

    applyNormalization(sqlite);

    const unitOf = (id: number) =>
      (sqlite.prepare("SELECT packageUnit FROM ingredient WHERE id = ?").get(id) as { packageUnit: string | null })
        .packageUnit;

    expect(unitOf(legacyMl)).toBe("mL");
    expect(unitOf(legacyG)).toBe("g");
    expect(unitOf(alreadyOk)).toBe("mL");
    expect(unitOf(junk)).toBe("can");
    expect(unitOf(noPackage)).toBeNull();
    sqlite.close();
  });
});
