import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import {
  createTempDb,
  startIsolatedServer,
  stopIsolatedServer,
  stopIsolatedServerProcess,
  type IsolatedServerHandle,
} from "../support/isolatedServer";
import type { HandVerifiedFixture } from "../integration/support/scaleFixture";

/**
 * S-503 NFR-2/NFR-3 scale + perf verification, at the REAL HTTP/page
 * level (docs/stories/S-503-e2e-journeys-scale.md's "TEST: (e2e/perf)
 * with the scale DB, load `/what-can-i-cook`, `/recipes`, `/pantry` —
 * server response + LCP proxy within budget" task; FR-5's own 300ms
 * search criterion).
 *
 * Complements (does not replace) tests/integration/scale.test.ts, which
 * times ONLY `data/whatCanICook#getWhatCanICook`'s Flow C compute in
 * isolation and does the deeper "zero false positives" correctness
 * counter-check. This file instead measures what a user actually
 * experiences: a full page navigation (RSC render + network) against the
 * SAME deterministic scale dataset (tests/integration/support/
 * scaleFixture.ts), served by a real, separately-spawned `next start`
 * process (tests/support/isolatedServer.ts) — never the shared e2e DB
 * every other `tests/e2e/*.spec.ts` file writes into.
 *
 * Sequencing: the isolated server is started ONCE against a brand-new
 * `DB_PATH` (so `instrumentation.ts`'s migrate-then-seed boot hook runs
 * normally, architecture.md §6 Flow A), then STOPPED, then the scale
 * fixture is written directly into that now-migrated-and-seeded sqlite
 * file by spawning `tests/integration/support/populateScaleFixtureCli.ts`
 * as a child process (this file lives outside `tests/integration/**`, so
 * it may not import `better-sqlite3` directly per architecture.md §5's
 * module-boundary rule — the CLI wrapper keeps that driver import inside
 * the exempted integration tier), then the server is RESTARTED against
 * the same file. This avoids ever having a live `next start` process and
 * a raw test-side connection open against the same file at once.
 *
 * OQ-4 note (per the story's Dev Notes: "flag, don't hard-fail, marginal
 * results pending OQ-4 hardware"): every measured duration is recorded
 * via `testInfo.annotations` (visible in the HTML/list reporter output
 * regardless of pass/fail) as the readiness-gate evidence. The actual
 * pass/fail assertions below use generous budgets consistent with
 * architecture.md §6 Flow C's own estimate (~10-20ms compute, two orders
 * of magnitude under the 2s ceiling) — a genuine miss at these budgets
 * would itself be a correctness regression, not a marginal/hardware-
 * sensitive result.
 */

const PORT = 3220;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const NFR2_PAGE_LOAD_BUDGET_MS = 2000;
const FR5_SEARCH_BUDGET_MS = 300;

test.use({ baseURL: BASE_URL });

// Forces this whole file into ONE worker (playwright.config.ts's
// `fullyParallel: true` would otherwise spread these tests across
// several workers, each independently re-running `beforeAll` — spawning
// several isolated servers on the SAME port and racing the shared
// module-scope `server`/`fixture` state, exactly like
// tests/e2e/journeys.spec.ts's own file-wide serial requirement).
test.describe.configure({ mode: "serial" });

let server: IsolatedServerHandle;
let fixture: HandVerifiedFixture;

test.beforeAll(async () => {
  test.setTimeout(180_000);

  const { dbPath } = createTempDb("dionysus-e2e-scale-");

  // 1) Boot against a brand-new DB so instrumentation.ts's migrate+seed
  //    hook runs normally.
  server = await startIsolatedServer(PORT, dbPath);

  // 2) Stop the process (file stays on disk) before writing directly to it.
  await stopIsolatedServerProcess(server);

  // 3) Populate the NFR-3 scale dataset directly, on top of the real seed,
  //    via the CLI wrapper (keeps the better-sqlite3 import inside the
  //    exempted tests/integration/** tier — see file header).
  const cliOutput = execFileSync(
    "npx",
    ["tsx", "tests/integration/support/populateScaleFixtureCli.ts", dbPath],
    { cwd: process.cwd(), encoding: "utf-8" },
  );
  fixture = JSON.parse(cliOutput.trim()) as HandVerifiedFixture;

  // 4) Restart the server against the now-scale-populated file.
  server = await startIsolatedServer(PORT, dbPath);
});

test.afterAll(async () => {
  if (server) await stopIsolatedServer(server);
});

test.beforeEach(({}, testInfo) => {
  test.skip(!testInfo.project.name.includes("chromium"), "scale/perf ACs measured once, on chromium, against the isolated scale DB");
});

test("dataset sanity: the running server is actually serving the NFR-3-scale dataset", async ({ page }) => {
  await page.goto("/ingredients");
  const searchBox = page.getByRole("textbox", { name: "Search ingredients" });
  await searchBox.fill(fixture.cookableIngredientName);
  await expect(page.getByTestId("ingredient-row").filter({ hasText: fixture.cookableIngredientName })).toHaveCount(1);
});

test("NFR-3/NFR-2: /what-can-i-cook loads within budget at scale, and the hand-verified fixture is classified correctly", async ({
  page,
}, testInfo) => {
  const start = Date.now();
  const response = await page.goto("/what-can-i-cook", { waitUntil: "load" });
  const durationMs = Date.now() - start;

  testInfo.annotations.push({
    type: "NFR-2 timing",
    description: `/what-can-i-cook full page load at NFR-3 scale: ${durationMs}ms (budget ${NFR2_PAGE_LOAD_BUDGET_MS}ms)`,
  });
  // NFR-2 readiness-gate evidence.
  console.info(`[NFR-2] /what-can-i-cook load: ${durationMs}ms (budget ${NFR2_PAGE_LOAD_BUDGET_MS}ms)`);

  expect(response?.ok()).toBe(true);
  expect(durationMs).toBeLessThanOrEqual(NFR2_PAGE_LOAD_BUDGET_MS);

  await expect(page.getByRole("heading", { level: 1, name: "What Can I Cook" })).toBeVisible();

  // Success Criterion #2's counter-check, re-verified at the real page
  // level (tests/integration/scale.test.ts already verifies it against
  // the raw `getWhatCanICook` result — this re-confirms the SAME fixture
  // survives the full RSC render, not just the domain compute).
  const cookableRow = page
    .getByTestId("cookable-now-section")
    .getByTestId("cookable-recipe-row")
    .filter({ hasText: fixture.cookableRecipeName });
  await expect(cookableRow).toBeVisible();

  await expect(
    page.getByTestId("cookable-now-section").getByTestId("cookable-recipe-row").filter({ hasText: fixture.missingRecipeName }),
  ).toHaveCount(0);
  await expect(
    page
      .getByTestId("cookable-now-section")
      .getByTestId("cookable-recipe-row")
      .filter({ hasText: fixture.nearMatchRecipeName }),
  ).toHaveCount(0);
});

test("NFR-2: /recipes list loads within budget at scale (500 recipes, ~5 lines each, fully annotated)", async ({
  page,
}, testInfo) => {
  const start = Date.now();
  const response = await page.goto("/recipes", { waitUntil: "load" });
  const durationMs = Date.now() - start;

  testInfo.annotations.push({
    type: "NFR-2 timing",
    description: `/recipes full page load at NFR-3 scale (500 recipes): ${durationMs}ms (budget ${NFR2_PAGE_LOAD_BUDGET_MS}ms)`,
  });
  // NFR-2 readiness-gate evidence.
  console.info(`[NFR-2] /recipes load: ${durationMs}ms (budget ${NFR2_PAGE_LOAD_BUDGET_MS}ms)`);

  expect(response?.ok()).toBe(true);
  expect(durationMs).toBeLessThanOrEqual(NFR2_PAGE_LOAD_BUDGET_MS);

  await expect(page.getByRole("heading", { level: 1, name: "Recipes", exact: true })).toBeVisible();
  expect(await page.getByTestId("recipe-row").count()).toBe(fixture.recipeCount);
});

test("NFR-2: /pantry loads within budget at scale (300 pantry items)", async ({ page }, testInfo) => {
  const start = Date.now();
  const response = await page.goto("/pantry", { waitUntil: "load" });
  const durationMs = Date.now() - start;

  testInfo.annotations.push({
    type: "NFR-2 timing",
    description: `/pantry full page load at NFR-3 scale (300 pantry items): ${durationMs}ms (budget ${NFR2_PAGE_LOAD_BUDGET_MS}ms)`,
  });
  // NFR-2 readiness-gate evidence.
  console.info(`[NFR-2] /pantry load: ${durationMs}ms (budget ${NFR2_PAGE_LOAD_BUDGET_MS}ms)`);

  expect(response?.ok()).toBe(true);
  expect(durationMs).toBeLessThanOrEqual(NFR2_PAGE_LOAD_BUDGET_MS);

  await expect(page.getByRole("heading", { level: 1, name: "Pantry", exact: true })).toBeVisible();
  expect(await page.getByTestId("pantry-row").count()).toBe(fixture.pantryItemCount);
});

test("FR-5: ingredient catalog search (GET /api/ingredients?q=) responds within 300ms at ~2,350-row scale", async ({
  request,
}, testInfo) => {
  const start = Date.now();
  const response = await request.get("/api/ingredients?q=Scale%20Fixture");
  const durationMs = Date.now() - start;

  testInfo.annotations.push({
    type: "FR-5 timing",
    description: `GET /api/ingredients?q= at ~2,350-ingredient scale: ${durationMs}ms (budget ${FR5_SEARCH_BUDGET_MS}ms)`,
  });
  // FR-5 readiness-gate evidence.
  console.info(`[FR-5] ingredient search: ${durationMs}ms (budget ${FR5_SEARCH_BUDGET_MS}ms)`);

  expect(response.ok()).toBe(true);
  const results = (await response.json()) as Array<{ name: string }>;
  expect(results.map((r) => r.name)).toEqual(
    expect.arrayContaining([fixture.cookableIngredientName, fixture.nearMatchIngredientName, fixture.missingIngredientName]),
  );

  expect(durationMs).toBeLessThanOrEqual(FR5_SEARCH_BUDGET_MS);
});
