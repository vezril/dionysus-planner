import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import * as schema from "@/data/schema";
import { seed } from "@/data/seed/seed";
import type { SeedRow } from "@/data/seed/seed";
import realSeedData from "@/data/seed/seed-data.json";

/**
 * S-203 AC-6 / architecture.md Risk #6: `/api/health` must never report
 * healthy before the migrate+seed transaction has committed (NFR-1 race).
 *
 * `app/api/health/route.ts` does not exist yet (only `app/api/.gitkeep`) —
 * every test below is intentionally RED (dynamic-import module-not-found)
 * until the implementer creates it.
 *
 * Route Handlers are plain exported functions (`GET(request: Request):
 * Promise<Response> | Response`) — callable directly here with a
 * synthetic `Request`, no running Next.js server required (architecture.md
 * §5 ADR-004).
 *
 * ============================ PINNED CONTRACT ============================
 * export const runtime = "nodejs";              // ADR-004: better-sqlite3 is Node-only
 * export async function GET(request: Request): Promise<Response>
 *   - Opens its own DB connection per invocation (via data/db.ts's
 *     createDb(), which resolves DB_PATH from the environment) rather than
 *     caching a module-scope singleton at import time — otherwise this
 *     route could never observe a DB_PATH that changes between requests
 *     (irrelevant in prod, but the concrete reason a stale "healthy" cache
 *     would violate the NFR-1 race the AC guards against).
 *   - Must NOT throw for "DB file doesn't exist yet" / "tables don't exist
 *     yet" (pre-migration boot) — those states must produce a non-200
 *     response, not an unhandled exception.
 *   - Returns 200 only once migrations have applied AND the seed-complete
 *     signal is true (e.g. ingredient row count, or a meta flag) — a
 *     non-200 (503 is the conventional health-check failure code)
 *     otherwise.
 * ===========================================================================
 *
 * Test strategy: each test points `DB_PATH` at a private temp-file DB and
 * `vi.resetModules()`s before a fresh `await import()` of the route, so
 * whichever way the implementer wires the DB connection (module-scope or
 * per-request), the route observes the DB_PATH/DB state this test just set
 * up — never a state left over from another test.
 */
describe("GET /api/health", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalNextRuntime = process.env.NEXT_RUNTIME;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-health-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.NEXT_RUNTIME = "nodejs";
    vi.resetModules();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalNextRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = originalNextRuntime;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("declares the nodejs runtime (ADR-004 — better-sqlite3 cannot run on the Edge runtime)", async () => {
    const route = await import("@/app/api/health/route");
    expect(route.runtime).toBe("nodejs");
  });

  it("does not report healthy on a fresh boot before any migration has run", async () => {
    const route = await import("@/app/api/health/route");

    const response = await route.GET(new Request("http://localhost/api/health"));

    expect(response).toBeInstanceOf(Response);
    expect(response.status).not.toBe(200);
  });

  it("does not report healthy once migrations have applied but before the seed has committed", async () => {
    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);
    setupSqlite.close();

    const route = await import("@/app/api/health/route");
    const response = await route.GET(new Request("http://localhost/api/health"));

    expect(response.status).not.toBe(200);
  });

  it("returns 200 once migrate+seed have committed (NFR-1, Risk #6)", async () => {
    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);
    const db = drizzle(setupSqlite, { schema });
    await seed(db, realSeedData as SeedRow[]);
    setupSqlite.close();

    const route = await import("@/app/api/health/route");
    const response = await route.GET(new Request("http://localhost/api/health"));

    expect(response.status).toBe(200);
  });
});
