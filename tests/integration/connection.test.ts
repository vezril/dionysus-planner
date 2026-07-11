import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "@/data/db";

/**
 * `createDb`'s current scaffold signature takes a required `path: string`
 * (S-101 placeholder). This story's AC2 requires DB_PATH/fallback
 * resolution when no path is supplied, so these tests call it with zero
 * arguments via this narrowed alias rather than fighting the compiler —
 * the production signature is expected to change to `(path?: string)`.
 */
const createDbWithResolution = createDb as unknown as (path?: string) => ReturnType<typeof createDb>;

/**
 * S-201 AC2 — data/db.ts's connection factory: WAL journal mode and
 * `foreign_keys` enforcement must be active on every open, and the DB path
 * must resolve from `DB_PATH` with a dev fallback of
 * `./.dev-data/dionysus.db` (directory auto-created).
 *
 * `createDb` is expected to return a Drizzle `better-sqlite3` instance,
 * which exposes the underlying raw connection via the documented `$client`
 * property (architecture.md §5: "export a drizzle instance factory usable
 * with :memory: for tests" — tests pass an explicit path; the DB_PATH/
 * fallback resolution below expects `createDb` to accept an *optional*
 * path, resolving internally when omitted).
 */
describe("data/db.ts createDb — connection pragmas and path resolution", () => {
  const originalDbPath = process.env.DB_PATH;
  const originalCwd = process.cwd();
  let scratchDir: string;

  beforeEach(() => {
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "dionysus-db-test-"));
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = originalDbPath;
    }
    fs.rmSync(scratchDir, { recursive: true, force: true });
  });

  it("applies WAL journal mode and foreign_keys=ON on a file-based DB", () => {
    const dbPath = path.join(scratchDir, "wal-check.db");
    const db = createDb(dbPath);
    const raw = db.$client;

    expect(raw.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(raw.pragma("foreign_keys", { simple: true })).toBe(1);

    raw.close();
  });

  it("honors an explicit DB_PATH-resolved path argument, creating the file there", () => {
    const dbPath = path.join(scratchDir, "custom", "dionysus.db");
    const db = createDb(dbPath);
    db.$client.close();

    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it("resolves to ./.dev-data/dionysus.db and creates the directory when DB_PATH is unset", () => {
    delete process.env.DB_PATH;
    process.chdir(scratchDir);

    const db = createDbWithResolution();
    db.$client.close();

    const expectedDir = path.join(scratchDir, ".dev-data");
    const expectedFile = path.join(expectedDir, "dionysus.db");
    expect(fs.existsSync(expectedDir)).toBe(true);
    expect(fs.existsSync(expectedFile)).toBe(true);
  });

  it("resolves the DB_PATH env var when set, without touching the fallback location", () => {
    const customPath = path.join(scratchDir, "env-configured", "dionysus.db");
    process.env.DB_PATH = customPath;
    process.chdir(scratchDir);

    const db = createDbWithResolution();
    db.$client.close();

    expect(fs.existsSync(customPath)).toBe(true);
    expect(fs.existsSync(path.join(scratchDir, ".dev-data"))).toBe(false);
  });
});
