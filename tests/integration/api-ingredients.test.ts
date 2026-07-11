import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient } from "./support/rawFixtures";

/**
 * S-301 AC-3 / architecture.md §5 ADR-004: `GET /api/ingredients` is the
 * Route Handler backing both the ingredient-catalog search box (FR-5) and
 * (per the story's Dev Notes) the reusable ingredient-picker backend for
 * pantry (S-304) and recipe (S-401) comboboxes.
 *
 * `app/api/ingredients/route.ts` does not exist yet (only `app/api/.gitkeep`
 * — `app/api/health/route.ts` is the only route built so far) — every test
 * below is intentionally RED (dynamic-import module-not-found) until the
 * implementer creates it.
 *
 * Route Handlers are plain exported functions (`GET(request: Request):
 * Promise<Response> | Response`), callable directly here with a synthetic
 * `Request` — no running Next.js server required (mirrors
 * tests/integration/health.test.ts's pattern, architecture.md §5 ADR-004).
 *
 * ============================ PINNED CONTRACT ============================
 * export const runtime = "nodejs";   // ADR-004: better-sqlite3 is Node-only
 * export async function GET(request: Request): Promise<Response>
 *   - Parses `q` from the request URL's search params.
 *   - Missing `q` OR `q=""` (empty string) => delegates to
 *     `ingredientRepo.listAll(db)` (the full catalog, per AC-3 "empty/
 *     missing q returns the full list").
 *   - Non-empty `q` => delegates to `ingredientRepo.searchByName(db, q)`
 *     (case-insensitive SUBSTRING match — already implemented and green,
 *     data/repositories/ingredientRepo.ts).
 *   - Opens its own DB connection per invocation via `data/db.ts`'s
 *     `createDb()` (resolves `DB_PATH` from the environment, mirroring
 *     `data/health.ts`'s per-call-connection pattern) — never a module-
 *     scope singleton captured at import time, so this test's per-test
 *     `DB_PATH` + `vi.resetModules()` setup is actually observed.
 *   - Returns 200 with a JSON array body. Each element is the
 *     `IngredientRecord` shape `ingredientRepo` already returns, projected
 *     or as-is — at minimum this test pins `id`, `name`, `unitClass`,
 *     `source`, `caloriesPerRef`, `proteinPerRef`, `carbsPerRef`,
 *     `fatPerRef` as present on every element (the catalog's "key
 *     nutrition values" per AC-1, needed so the client search box can
 *     re-render filtered rows with the same information the initial SSR
 *     list showed).
 *   - Must NOT throw for a DB that doesn't exist / isn't migrated yet —
 *     that's a health-route concern, not this route's; this route is only
 *     ever called once the app has booted (migrate+seed already ran), so
 *     this suite always sets up a migrated+seeded-with-fixture-rows DB
 *     before importing the route.
 * ===========================================================================
 */
describe("GET /api/ingredients", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalNextRuntime = process.env.NEXT_RUNTIME;

  let onionYellowId: number;
  let onionRedId: number;
  let garlicId: number;
  let appleJuiceId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-api-ingredients-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.NEXT_RUNTIME = "nodejs";
    vi.resetModules();

    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);

    onionYellowId = insertRawIngredient(setupSqlite, {
      name: "Onion, yellow, medium",
      source: "SEEDED",
      caloriesPerRef: 40,
      proteinPerRef: 1.1,
      carbsPerRef: 9.3,
      fatPerRef: 0.1,
    });
    onionRedId = insertRawIngredient(setupSqlite, {
      name: "Onion, red, medium",
      source: "SEEDED",
      caloriesPerRef: 40,
      proteinPerRef: 1.1,
      carbsPerRef: 9.3,
      fatPerRef: 0.1,
    });
    garlicId = insertRawIngredient(setupSqlite, {
      name: "Garlic, raw",
      source: "SEEDED",
      caloriesPerRef: 149,
      proteinPerRef: 6.4,
      carbsPerRef: 33.1,
      fatPerRef: 0.5,
    });
    appleJuiceId = insertRawIngredient(setupSqlite, {
      name: "Apple juice",
      source: "CUSTOM",
      unitClass: "VOLUME",
      caloriesPerRef: 46,
      proteinPerRef: 0.1,
      carbsPerRef: 11.3,
      fatPerRef: 0.1,
    });

    setupSqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalNextRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = originalNextRuntime;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("declares the nodejs runtime (ADR-004 — better-sqlite3 cannot run on the Edge runtime)", async () => {
    const route = await import("@/app/api/ingredients/route");
    expect(route.runtime).toBe("nodejs");
  });

  it("returns all four fixture rows when no ?q is given (AC-3: missing q returns the full list)", async () => {
    const route = await import("@/app/api/ingredients/route");

    const response = await route.GET(new Request("http://localhost/api/ingredients"));

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    const body = (await response.json()) as unknown[];
    expect(body).toHaveLength(4);
  });

  it("returns all rows when ?q= is present but empty (AC-3: empty q returns the full list)", async () => {
    const route = await import("@/app/api/ingredients/route");

    const response = await route.GET(new Request("http://localhost/api/ingredients?q="));

    expect(response.status).toBe(200);
    const body = (await response.json()) as unknown[];
    expect(body).toHaveLength(4);
  });

  it("filters to case-insensitive substring matches for ?q=onion (AC-2/AC-3, lowercase query)", async () => {
    const route = await import("@/app/api/ingredients/route");

    const response = await route.GET(new Request("http://localhost/api/ingredients?q=onion"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ id: number; name: string }>;
    const ids = body.map((row) => row.id).sort((a, b) => a - b);
    expect(ids).toEqual([onionYellowId, onionRedId].sort((a, b) => a - b));
  });

  it("matches case-insensitively for an uppercase ?q=ONION query", async () => {
    const route = await import("@/app/api/ingredients/route");

    const response = await route.GET(new Request("http://localhost/api/ingredients?q=ONION"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ id: number; name: string }>;
    expect(body.map((row) => row.name).sort()).toEqual(["Onion, red, medium", "Onion, yellow, medium"].sort());
  });

  it("excludes non-matching rows for a query with no matches (e.g. ?q=zzznotfound)", async () => {
    const route = await import("@/app/api/ingredients/route");

    const response = await route.GET(new Request("http://localhost/api/ingredients?q=zzznotfound"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as unknown[];
    expect(body).toEqual([]);
  });

  it("each returned row carries id, name, unitClass, source, and key nutrition fields (response shape stable for the client)", async () => {
    const route = await import("@/app/api/ingredients/route");

    const response = await route.GET(new Request("http://localhost/api/ingredients?q=garlic"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    const [row] = body;
    expect(row).toMatchObject({
      id: garlicId,
      name: "Garlic, raw",
      unitClass: "MASS",
      source: "SEEDED",
      caloriesPerRef: 149,
      proteinPerRef: 6.4,
      carbsPerRef: 33.1,
      fatPerRef: 0.5,
    });
  });

  it("distinguishes CUSTOM rows from SEEDED rows in the response (FR-3/FR-4 UI groundwork, AC-4)", async () => {
    const route = await import("@/app/api/ingredients/route");

    const response = await route.GET(new Request("http://localhost/api/ingredients?q=apple"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{ id: number; source: string }>;
    expect(body).toEqual([expect.objectContaining({ id: appleJuiceId, source: "CUSTOM" })]);
  });
});
