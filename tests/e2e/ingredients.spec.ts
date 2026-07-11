import { expect, test } from "@playwright/test";

/**
 * S-301 Ingredient catalog view & search — acceptance criteria coverage
 * (docs/stories/S-301-ingredient-catalog-search.md).
 *
 * Fresh-install context: the dev/e2e server boots with `instrumentation.ts`'s
 * migrate-then-seed hook (architecture.md §6 Flow A), which loads the
 * checked-in 351-row seed (data/seed/seed-data.json, S-204) before any
 * request is served — so `/ingredients` is NEVER empty by default. This
 * supersedes S-105's placeholder empty-state contract for this one route;
 * see tests/e2e/shell.spec.ts for the corresponding update.
 *
 * `/app/ingredients/page.tsx` is still the S-105 placeholder (static h1 +
 * EmptyState, no data fetching) — every test below is intentionally RED
 * until the implementer builds the real RSC catalog + client search box.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Page (`/app/ingredients`, RSC):
 *   - One `<h1>` "Ingredients" (unchanged from S-105).
 *   - One row per ingredient, each carrying `data-testid="ingredient-row"`
 *     (works whichever markup the implementer picks — shadcn `<Table>` rows
 *     or stacked mobile cards, per the story's task list — the testid is
 *     the stable seam, not the element type).
 *   - Each row is or contains a link (`role="link"`) whose `href` matches
 *     `/^\/ingredients\/\d+\/edit$/` (AC-4 — target page arrives in S-302;
 *     404 until then is acceptable per the story, not asserted here).
 *   - Each row contains a `data-testid="source-badge"` element whose text
 *     is exactly "SEEDED" or "CUSTOM" (AC-4, matching the domain `source`
 *     enum verbatim — no prose paraphrase to keep this assertion exact).
 *   - ≥300 rows render on initial load with no search applied (AC-1).
 *
 * Search box (client island):
 *   - A single `<input>` (or shadcn Combobox input) with accessible name
 *     "Search ingredients" (via `<label>` or `aria-label`) — reachable via
 *     `getByRole("textbox", { name: "Search ingredients" })`.
 *   - Typing filters the rendered `ingredient-row` list to case-insensitive
 *     substring matches within 300 ms (AC-2) — this suite polls for the
 *     narrowed count rather than asserting on an internal debounce timer.
 *   - Clearing the box restores the full ≥300-row list.
 *   - A query with no matches renders `data-testid="ingredient-no-results"`
 *     and zero `ingredient-row` elements (no bare crash/blank screen).
 * ===========================================================================
 *
 * Scoped to chromium only (per architecture ADR-007's ADR-004 Route
 * Handler note and this story's own e2e task split): the browser/viewport
 * matrix itself stays with tests/e2e/smoke.spec.ts; the dedicated 375px
 * check below runs on the mobile-375 project only, per the story's task
 * list ("e2e (mobile project) catalog at 375px").
 */

const MIN_SEEDED_INGREDIENT_COUNT = 300;

test.describe("S-301 ingredient catalog & search", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "detailed catalog ACs verified once on chromium");
  });

  test("AC-1: /ingredients server-renders at least 300 ingredient rows on a fresh install", async ({ page }) => {
    const response = await page.goto("/ingredients");
    expect(response?.ok()).toBe(true);

    await expect(page.getByRole("heading", { level: 1, name: "Ingredients", exact: true })).toBeVisible();

    const rows = page.getByTestId("ingredient-row");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(MIN_SEEDED_INGREDIENT_COUNT);
  });

  test("AC-4: each ingredient row shows a SEEDED or CUSTOM source badge", async ({ page }) => {
    await page.goto("/ingredients");

    const rows = page.getByTestId("ingredient-row");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Spot-check a sample rather than every row (351 assertions would be
    // redundant once the pattern holds) — first, middle, last.
    const sampleIndexes = [0, Math.floor(rowCount / 2), rowCount - 1];
    for (const index of sampleIndexes) {
      const badge = rows.nth(index).getByTestId("source-badge");
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText(/^(SEEDED|CUSTOM)$/);
    }
  });

  test("AC-4: each ingredient row links to its edit route", async ({ page }) => {
    await page.goto("/ingredients");

    const firstRow = page.getByTestId("ingredient-row").first();
    const link = firstRow.getByRole("link").first();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/ingredients\/\d+\/edit$/);
  });

  test("AC-2: typing \"onion\" narrows the list to case-insensitive substring matches", async ({ page }) => {
    await page.goto("/ingredients");

    const searchBox = page.getByRole("textbox", { name: "Search ingredients" });
    await expect(searchBox).toBeVisible();

    await searchBox.fill("onion");

    const rows = page.getByTestId("ingredient-row");
    await expect(async () => {
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(MIN_SEEDED_INGREDIENT_COUNT);
    }).toPass({ timeout: 300 });

    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i++) {
      await expect(rows.nth(i)).toContainText(/onion/i);
    }
  });

  test("AC-2: clearing the search box restores the full catalog", async ({ page }) => {
    await page.goto("/ingredients");

    const searchBox = page.getByRole("textbox", { name: "Search ingredients" });
    const rows = page.getByTestId("ingredient-row");

    await searchBox.fill("onion");
    await expect(async () => {
      expect(await rows.count()).toBeLessThan(MIN_SEEDED_INGREDIENT_COUNT);
    }).toPass({ timeout: 300 });

    await searchBox.fill("");

    await expect(async () => {
      expect(await rows.count()).toBeGreaterThanOrEqual(MIN_SEEDED_INGREDIENT_COUNT);
    }).toPass({ timeout: 300 });
  });

  test("AC-3 (via UI): a search term with no matches shows the no-results state, not a blank/crashed list", async ({
    page,
  }) => {
    await page.goto("/ingredients");

    const searchBox = page.getByRole("textbox", { name: "Search ingredients" });
    await searchBox.fill("zzz-no-such-ingredient-zzz");

    await expect(page.getByTestId("ingredient-no-results")).toBeVisible({ timeout: 300 });
    expect(await page.getByTestId("ingredient-row").count()).toBe(0);
  });
});

test.describe("S-301 ingredient catalog at 375px (NFR-8)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-375", "375px assertions run only in the mobile-375 project");
  });

  test("AC-5: /ingredients has no horizontal scroll at 375px and rows are readable", async ({ page }) => {
    const response = await page.goto("/ingredients");
    expect(response?.ok()).toBe(true);

    const rows = page.getByTestId("ingredient-row");
    await expect(rows.first()).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);

    const firstRowBox = await rows.first().boundingBox();
    expect(firstRowBox).not.toBeNull();
    expect(firstRowBox!.width).toBeGreaterThan(0);
    expect(firstRowBox!.height).toBeGreaterThan(0);
  });
});
