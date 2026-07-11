import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@/data/migrate";
import { insertRawIngredient, insertRawPantryItem, insertRawRecipe, insertRawRecipeLine } from "./support/rawFixtures";

/**
 * S-502 "Adjustable near-match threshold" (docs/stories/S-502-near-match-
 * threshold.md, prd.md FR-23, architecture.md ADR-004 + §6 Flow C).
 *
 * `GET /api/what-can-i-cook?threshold=` is the Route Handler the client
 * threshold slider calls to re-fetch the Near Match section without a full
 * page reload. `app/api/what-can-i-cook/route.ts` does not exist yet (only
 * `app/api/.gitkeep` and the sibling `app/api/ingredients/route.ts`,
 * `app/api/health/route.ts`) — every test below is intentionally RED
 * (dynamic-import module-not-found) until the implementer builds it.
 *
 * Route Handlers are plain exported functions (`GET(request: Request):
 * Promise<Response>`), callable directly here with a synthetic `Request` —
 * no running Next.js server required (mirrors tests/integration/api-
 * ingredients.test.ts's pattern).
 *
 * ============================ PINNED CONTRACT ============================
 * `app/api/what-can-i-cook/route.ts`:
 *
 *   export const runtime = "nodejs";   // ADR-004: better-sqlite3 is Node-only
 *   export async function GET(request: Request): Promise<Response>
 *
 *   - Parses `threshold` from the request URL's search params.
 *   - Reuses S-501's shared assembly function
 *     (`data/whatCanICook#getWhatCanICook(threshold)` — the two-query scan
 *     + `computeCookableAndNearMatch`) — this story's Dev Notes explicitly
 *     forbid duplicating the scan logic in the route.
 *   - Missing `threshold` OR a non-numeric value (e.g. `?threshold=banana`)
 *     -> falls back to `app/lib/threshold#resolveDefaultThreshold()` (AC-4
 *     / story task list: "missing/invalid threshold falls back to the
 *     env-resolved default").
 *   - Out-of-range values are clamped server-side, never trusted from the
 *     client (AC-3): negative values clamp to 0; values above a sane cap
 *     clamp to that cap. This suite pins the cap at 20 per the story's own
 *     task-list example ("0 <= t <= a sane cap, e.g., 20") — an absurd
 *     value like `10000` must clamp to 20, not be rejected outright, not
 *     pass through unclamped, and not silently fall back to the default.
 *   - Returns 200 with a JSON body matching `MatchResult`'s shape verbatim
 *     (`{ cookable, nearMatch, missingMoreCount }`) — AC-2: "the same
 *     result shape as the initial RSC render computed at that threshold."
 * ===========================================================================
 */
describe("GET /api/what-can-i-cook", () => {
  let tmpDir: string;
  let dbPath: string;
  const originalDbPath = process.env.DB_PATH;
  const originalNextRuntime = process.env.NEXT_RUNTIME;
  const originalThresholdEnv = process.env.NEAR_MATCH_DEFAULT_THRESHOLD;

  let chickenId: number;
  let riceId: number;
  let brothId: number;
  let garlicId: number;
  let onionId: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), `dionysus-api-wcic-test-${randomUUID()}-`));
    dbPath = join(tmpDir, "dionysus.db");
    process.env.DB_PATH = dbPath;
    process.env.NEXT_RUNTIME = "nodejs";
    delete process.env.NEAR_MATCH_DEFAULT_THRESHOLD;
    vi.resetModules();

    const setupSqlite = new Database(dbPath);
    runMigrations(setupSqlite);

    // Pantry holds chicken (plenty) only — rice, broth, garlic, onion are
    // absent (guaranteed MISSING lines).
    chickenId = insertRawIngredient(setupSqlite, { name: "Chicken Breast", unitClass: "MASS" });
    riceId = insertRawIngredient(setupSqlite, { name: "Rice", unitClass: "MASS" });
    brothId = insertRawIngredient(setupSqlite, { name: "Broth", unitClass: "MASS" });
    garlicId = insertRawIngredient(setupSqlite, { name: "Garlic", unitClass: "MASS" });
    onionId = insertRawIngredient(setupSqlite, { name: "Onion", unitClass: "MASS" });

    insertRawPantryItem(setupSqlite, chickenId, {
      quantityCanonical: 500,
      entryUnitClass: "MASS",
      displayQuantity: 500,
      displayUnit: "g",
    });

    // Cookable: chicken 400g required, 500g held.
    const cookableRecipeId = insertRawRecipe(setupSqlite, { name: "Chicken Bowl" });
    insertRawRecipeLine(setupSqlite, cookableRecipeId, chickenId, {
      quantityCanonical: 400,
      entryUnitClass: "MASS",
      displayQuantity: 400,
      displayUnit: "g",
    });

    // 4-missing recipe: rice, broth, garlic, onion all fully missing ->
    // exactly 4 unsatisfied lines. Included in Near Match at threshold >=
    // 4, excluded (and counted in missingMoreCount) below that.
    const fourMissingId = insertRawRecipe(setupSqlite, { name: "Four Missing Feast" });
    insertRawRecipeLine(setupSqlite, fourMissingId, riceId, {
      quantityCanonical: 300,
      entryUnitClass: "MASS",
      displayQuantity: 300,
      displayUnit: "g",
    });
    insertRawRecipeLine(setupSqlite, fourMissingId, brothId, {
      quantityCanonical: 300,
      entryUnitClass: "MASS",
      displayQuantity: 300,
      displayUnit: "g",
    });
    insertRawRecipeLine(setupSqlite, fourMissingId, garlicId, {
      quantityCanonical: 50,
      entryUnitClass: "MASS",
      displayQuantity: 50,
      displayUnit: "g",
    });
    insertRawRecipeLine(setupSqlite, fourMissingId, onionId, {
      quantityCanonical: 50,
      entryUnitClass: "MASS",
      displayQuantity: 50,
      displayUnit: "g",
    });

    setupSqlite.close();
  });

  afterEach(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalNextRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = originalNextRuntime;
    if (originalThresholdEnv === undefined) delete process.env.NEAR_MATCH_DEFAULT_THRESHOLD;
    else process.env.NEAR_MATCH_DEFAULT_THRESHOLD = originalThresholdEnv;
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("declares the nodejs runtime (ADR-004 — better-sqlite3 cannot run on the Edge runtime)", async () => {
    const route = await import("@/app/api/what-can-i-cook/route");
    expect(route.runtime).toBe("nodejs");
  });

  it("AC2: ?threshold=5 returns the same MatchResult shape the RSC page computes at threshold 5", async () => {
    const route = await import("@/app/api/what-can-i-cook/route");
    const { getWhatCanICook } = await import("@/data/whatCanICook");

    const response = await route.GET(new Request("http://localhost/api/what-can-i-cook?threshold=5"));
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      cookable: Array<{ name: string }>;
      nearMatch: Array<{ name: string }>;
      missingMoreCount: number;
    };
    const expected = await getWhatCanICook(5);

    expect(body.cookable.map((r) => r.name)).toEqual(expected.cookable.map((r) => r.name));
    expect(body.nearMatch.map((r) => r.name)).toEqual(expected.nearMatch.map((r) => r.name));
    expect(body.missingMoreCount).toBe(expected.missingMoreCount);
  });

  it("FR-23: at threshold=5, the 4-missing fixture recipe appears in nearMatch", async () => {
    const route = await import("@/app/api/what-can-i-cook/route");

    const response = await route.GET(new Request("http://localhost/api/what-can-i-cook?threshold=5"));
    const body = (await response.json()) as { nearMatch: Array<{ name: string }>; missingMoreCount: number };

    expect(body.nearMatch.map((r) => r.name)).toContain("Four Missing Feast");
    expect(body.missingMoreCount).toBe(0);
  });

  it("FR-23: at threshold=1, the 4-missing fixture recipe is excluded and counted in missingMoreCount instead", async () => {
    const route = await import("@/app/api/what-can-i-cook/route");

    const response = await route.GET(new Request("http://localhost/api/what-can-i-cook?threshold=1"));
    const body = (await response.json()) as { nearMatch: Array<{ name: string }>; missingMoreCount: number };

    expect(body.nearMatch.map((r) => r.name)).not.toContain("Four Missing Feast");
    expect(body.missingMoreCount).toBe(1);
  });

  it("AC-4/story task: a missing ?threshold falls back to the env-resolved default (unset env -> 3, excludes the 4-missing recipe)", async () => {
    delete process.env.NEAR_MATCH_DEFAULT_THRESHOLD;
    const route = await import("@/app/api/what-can-i-cook/route");

    const response = await route.GET(new Request("http://localhost/api/what-can-i-cook"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { nearMatch: Array<{ name: string }>; missingMoreCount: number };

    expect(body.nearMatch.map((r) => r.name)).not.toContain("Four Missing Feast");
    expect(body.missingMoreCount).toBe(1);
  });

  it("AC-4/story task: an invalid ?threshold=banana falls back to the env-resolved default the same way a missing one does", async () => {
    process.env.NEAR_MATCH_DEFAULT_THRESHOLD = "3";
    const route = await import("@/app/api/what-can-i-cook/route");

    const response = await route.GET(new Request("http://localhost/api/what-can-i-cook?threshold=banana"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { nearMatch: Array<{ name: string }>; missingMoreCount: number };

    expect(body.nearMatch.map((r) => r.name)).not.toContain("Four Missing Feast");
    expect(body.missingMoreCount).toBe(1);
  });

  it("falls back to a CHANGED env default when threshold is missing (env read at call time, per app/lib/threshold's own contract)", async () => {
    process.env.NEAR_MATCH_DEFAULT_THRESHOLD = "5";
    const route = await import("@/app/api/what-can-i-cook/route");

    const response = await route.GET(new Request("http://localhost/api/what-can-i-cook"));
    const body = (await response.json()) as { nearMatch: Array<{ name: string }>; missingMoreCount: number };

    expect(body.nearMatch.map((r) => r.name)).toContain("Four Missing Feast");
    expect(body.missingMoreCount).toBe(0);
  });

  it("AC-3: a negative ?threshold=-5 clamps to 0, never throws, never passes the negative value through unclamped", async () => {
    const route = await import("@/app/api/what-can-i-cook/route");

    const response = await route.GET(new Request("http://localhost/api/what-can-i-cook?threshold=-5"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { cookable: Array<{ name: string }>; nearMatch: Array<{ name: string }> };

    // threshold clamped to 0: the fixture recipe with 0 unsatisfied lines
    // (Chicken Bowl) is cookable regardless; nothing with >=1 unsatisfied
    // line can appear in nearMatch at threshold 0.
    expect(body.nearMatch).toEqual([]);
    expect(body.cookable.map((r) => r.name)).toContain("Chicken Bowl");
  });

  it("AC-3: an absurd ?threshold=10000 clamps to a sane cap (20) rather than being passed through unbounded", async () => {
    const route = await import("@/app/api/what-can-i-cook/route");
    const { getWhatCanICook } = await import("@/data/whatCanICook");

    const response = await route.GET(new Request("http://localhost/api/what-can-i-cook?threshold=10000"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { nearMatch: Array<{ name: string }>; missingMoreCount: number };

    const cappedAt20 = await getWhatCanICook(20);
    expect(body.nearMatch.map((r) => r.name)).toEqual(cappedAt20.nearMatch.map((r) => r.name));
    expect(body.missingMoreCount).toBe(cappedAt20.missingMoreCount);
    // In particular: the 4-missing fixture recipe is included, not
    // excluded — proof the route didn't silently fall back to the
    // (much lower) env default instead of clamping.
    expect(body.nearMatch.map((r) => r.name)).toContain("Four Missing Feast");
  });
});
