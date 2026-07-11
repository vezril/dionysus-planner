import { expect, test, type Page } from "@playwright/test";

/**
 * S-404 Recipe list & name search — end-to-end wiring coverage
 * (docs/stories/S-404-recipe-list-search.md AC1/AC2).
 *
 * Readiness-gate note (per the story fix): the substring MATCHING logic is
 * unit-tested in isolation at tests/unit/domain/listFilters.test.ts against
 * the pure `filterByNameSubstring` predicate. This suite is deliberately
 * "thin wiring" on top of that — it does NOT re-derive substring-matching
 * edge cases (case folding, whitespace, etc.); it only proves the
 * `/recipes` page actually has a search box, that box is wired to SOME
 * client-side filter over the rendered rows, and the no-results state
 * renders — i.e. that the already-unit-tested predicate is really plugged
 * into the real page.
 *
 * `/app/recipes/page.tsx` currently renders the full, unfiltered list with
 * no search input at all (S-401's plain server-rendered list) — every test
 * below is intentionally RED until the implementer adds the client search
 * island (wrapping `domain/listFilters.ts#filterByNameSubstring`) per
 * architecture.md §6 Flow D (client-side filtering over the already-loaded
 * list, no per-keystroke round-trip).
 *
 * Test-isolation note (same pattern as tests/e2e/recipe-create.spec.ts and
 * tests/e2e/ingredient-delete.spec.ts): the e2e DB is persistent across
 * runs, so fixture recipe names below are suffixed with a run-unique token
 * and assertions only ever check for THIS run's own rows by name — never
 * an exact total row count.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Page `/app/recipes` (RSC + client search island):
 *   - `getByRole("textbox", { name: "Search recipes" })` — a single search
 *     input (accessible name "Search recipes", mirroring S-301's
 *     "Search ingredients" precedent in app/ingredients/_components/
 *     ingredient-catalog.tsx).
 *   - Typing a substring narrows the visible `data-testid="recipe-row"`
 *     elements to case-insensitive matches within 300 ms (FR-25's budget,
 *     trivially met by in-memory filtering per Flow D) — this suite polls
 *     rather than asserting on an internal debounce timer.
 *   - Clearing the box restores every previously-visible row.
 *   - A query matching nothing renders `data-testid="recipe-no-results"`
 *     and zero `recipe-row` elements (no bare crash/blank screen, FR-29's
 *     "never blank or an error" sibling behavior for the search path).
 * ===========================================================================
 *
 * Scoped to chromium only, per this story's own e2e task split (the
 * dedicated 375px layout check is a separate task/suite, not this one's
 * concern).
 */

async function createMinimalRecipe(page: Page, name: string): Promise<void> {
  await page.goto("/recipes/new");
  await expect(page.getByRole("heading", { level: 1, name: "New Recipe" })).toBeVisible();

  await page.getByRole("textbox", { name: "Recipe name" }).fill(name);
  await page.getByRole("spinbutton", { name: "Servings" }).fill("2");
  await page.getByRole("textbox", { name: "Instructions" }).fill("n/a");

  const addButton = page.getByRole("button", { name: "Add ingredient line" });
  while ((await page.getByTestId("recipe-line-row").count()) < 1) {
    await addButton.click();
  }
  const row = page.getByTestId("recipe-line-row").first();

  // Distinctive, single-match seeded ingredient name (data/seed/seed-data.json,
  // S-204) — same fixture used by tests/e2e/recipe-create.spec.ts.
  const ingredientInput = row.getByRole("textbox", { name: "Ingredient" });
  await ingredientInput.fill("Garlic, 1 clove");
  const option = row.getByTestId("recipe-ingredient-option").filter({ hasText: "Garlic, 1 clove" });
  await expect(option.first()).toBeVisible();
  await option.first().click();

  await row.getByRole("spinbutton", { name: "Quantity" }).fill("1");
  await row.getByRole("combobox", { name: "Unit" }).click();
  await page.getByRole("option", { name: "g", exact: true }).click();

  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
}

test.describe("S-404 recipe list search", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "search-wiring ACs verified once on chromium");
  });

  test("AC1: /recipes has a search textbox named \"Search recipes\"", async ({ page }) => {
    const response = await page.goto("/recipes");
    expect(response?.ok()).toBe(true);

    await expect(page.getByRole("textbox", { name: "Search recipes" })).toBeVisible();
  });

  test("AC2: typing a substring narrows the visible recipe rows to matches, case-insensitively; clearing restores them", async ({
    page,
  }) => {
    // Run-unique token: guarantees this test's assertions never collide
    // with fixture recipes left behind by earlier runs of this same file
    // (the e2e DB is not reset between runs).
    const runId = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const matchingName = `Zzchicken${runId} Stir-Fry`;
    const otherName = `Zzpasta${runId} Primavera`;

    await createMinimalRecipe(page, matchingName);
    await createMinimalRecipe(page, otherName);

    await page.goto("/recipes");
    const matchingRow = page.getByTestId("recipe-row").filter({ hasText: matchingName });
    const otherRow = page.getByTestId("recipe-row").filter({ hasText: otherName });
    await expect(matchingRow).toHaveCount(1);
    await expect(otherRow).toHaveCount(1);

    const searchBox = page.getByRole("textbox", { name: "Search recipes" });

    // Type the query in a DIFFERENT case than the fixture name to prove
    // the wiring is case-insensitive (the fold logic itself is
    // unit-tested; this only proves it's actually applied here).
    await searchBox.fill(`ZZCHICKEN${runId}`);

    await expect(async () => {
      await expect(matchingRow).toHaveCount(1);
      await expect(otherRow).toHaveCount(0);
    }).toPass({ timeout: 300 });

    await searchBox.fill("");

    await expect(async () => {
      await expect(matchingRow).toHaveCount(1);
      await expect(otherRow).toHaveCount(1);
    }).toPass({ timeout: 300 });
  });

  test("AC2: a query matching no recipe shows the no-results state, not a blank/crashed list", async ({ page }) => {
    const runId = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;

    await page.goto("/recipes");
    const searchBox = page.getByRole("textbox", { name: "Search recipes" });
    await searchBox.fill(`zzz-no-such-recipe-${runId}-zzz`);

    await expect(page.getByTestId("recipe-no-results")).toBeVisible({ timeout: 300 });
    expect(await page.getByTestId("recipe-row").count()).toBe(0);
  });
});
