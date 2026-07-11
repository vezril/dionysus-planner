import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// data/bootstrap.ts does not exist yet — every test below is intentionally
// RED (module-not-found) until the implementer creates it. This is the
// "boot orchestration function" the story's task list asks for
// (docs/stories/S-203-seed-mechanism-boot.md task: "TEST: boot
// orchestration function (`bootstrap()` in `/data` or called from
// instrumentation)..."). Putting the orchestration in a plain, dependency-
// injected /data function — rather than only inline in the Next.js-only
// instrumentation.ts — is what makes Flow A's ordering directly unit/
// integration-testable without booting Next.js itself.
import { bootstrap } from "@/data/bootstrap";
import type { SeedRow } from "@/data/seed/seed";
import { SAMPLE_SEED_ROWS } from "./support/seedFixtures";
import { tableNames } from "./support/migratedDb";

/**
 * S-203 AC-5 / architecture.md §6 Flow A ordering: "apply migrations FIRST,
 * then seed, both idempotent" — exercised here against a real temp-file
 * SQLite database (not `:memory:`) to mirror a real container-restart
 * boot, per the story task's literal wording ("on an empty temp-file DB").
 *
 * ============================ PINNED API SHAPE ============================
 * export async function bootstrap(
 *   sqlite: Database.Database,   // an OPEN, unmigrated (or already-migrated) connection
 *   rows: SeedRow[],             // e.g. the parsed data/seed/seed-data.json content
 * ): Promise<void>
 *   - Step 1: runMigrations(sqlite) (data/migrate.ts) — creates the schema
 *     on a fresh DB, applies only pending migrations on an existing one.
 *   - Step 2: seed(drizzle(sqlite, { schema }), rows) (data/seed/seed.ts).
 *   - Must be safe to call twice on the same connection (dev hot-reload
 *     may re-invoke instrumentation.ts#register() more than once, Flow A).
 *   - instrumentation.ts#register() is expected to call only this function
 *     (or the two /data entry points directly) inside its
 *     `NEXT_RUNTIME === 'nodejs'` guard — never import drizzle itself
 *     (§5 boundary rule).
 * ===========================================================================
 */
describe("data/bootstrap.ts — bootstrap() (migrate-then-seed boot orchestration)", () => {
  let tmpDir: string;
  let dbPath: string;
  let sqlite: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-bootstrap-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    sqlite = new Database(dbPath);
  });

  afterEach(() => {
    sqlite.close();
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("on a fresh, empty temp-file DB: creates the schema and seeds every row", async () => {
    await bootstrap(sqlite, SAMPLE_SEED_ROWS as SeedRow[]);

    expect(tableNames(sqlite)).toEqual(
      expect.arrayContaining(["ingredient", "pantry_item", "recipe", "recipe_line", "recipe_tag"]),
    );

    const count = (sqlite.prepare(`SELECT COUNT(*) AS n FROM ingredient`).get() as { n: number }).n;
    expect(count).toBe(SAMPLE_SEED_ROWS.length);
  });

  it("is safe to call twice on the same connection (dev hot-reload re-invocation) — no duplicate rows, no thrown error", async () => {
    await bootstrap(sqlite, SAMPLE_SEED_ROWS as SeedRow[]);

    await expect(bootstrap(sqlite, SAMPLE_SEED_ROWS as SeedRow[])).resolves.not.toThrow();

    const count = (sqlite.prepare(`SELECT COUNT(*) AS n FROM ingredient`).get() as { n: number }).n;
    expect(count).toBe(SAMPLE_SEED_ROWS.length);
  });

  it("preserves an override across a second bootstrap() call with corrected upstream data", async () => {
    await bootstrap(sqlite, SAMPLE_SEED_ROWS as SeedRow[]);

    sqlite
      .prepare(`UPDATE ingredient SET overridden = 1, caloriesPerRef = 999 WHERE seedKey = ?`)
      .run("test:onion");

    const corrected = (SAMPLE_SEED_ROWS as SeedRow[]).map((row) =>
      row.seedKey === "test:onion" ? { ...row, caloriesPerRef: 45 } : row,
    );
    await bootstrap(sqlite, corrected);

    const onion = sqlite.prepare(`SELECT caloriesPerRef, overridden FROM ingredient WHERE seedKey = ?`).get(
      "test:onion",
    ) as { caloriesPerRef: number; overridden: number };
    expect(onion.caloriesPerRef).toBe(999);
    expect(onion.overridden).toBe(1);
  });
});
