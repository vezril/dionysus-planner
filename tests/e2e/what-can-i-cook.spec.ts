import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * S-501 What Can I Cook view — acceptance criteria coverage
 * (docs/stories/S-501-what-can-i-cook.md AC1-AC3, AC6 partial via the
 * missing-more tail; UJ-3; FR-20, FR-21, FR-22).
 *
 * `/app/what-can-i-cook/page.tsx` is still the S-105 placeholder (static
 * h1 + one generic EmptyState, no data fetching at all) — every test
 * below is intentionally RED until the implementer builds the real RSC
 * page per architecture.md §6 Flow C: `pantryRepo.getAllAsIndex` +
 * `recipeRepo.getAllWithLines` -> `domain/matching
 * .computeCookableAndNearMatch(…, resolveDefaultThreshold())` -> render.
 *
 * Test-isolation note (same discipline as tests/e2e/recipe-create.spec.ts,
 * tests/e2e/ingredient-edit.spec.ts, tests/e2e/pantry-edit.spec.ts): the
 * e2e DB is persistent and shared across this whole `webServer` run and
 * every other spec file (`fullyParallel: true`). This suite creates its
 * OWN, disjoint custom ingredients and recipes (unique, timestamped
 * names) and NEVER asserts an exact Cookable Now / Near Match / missing-
 * more COUNT — only that THIS suite's own fixtures land in the right
 * place, and (for the missing-more tail) that the count increases by
 * exactly 1 when this suite adds its own over-threshold recipe. This is
 * deliberate: a genuine "first-run empty DB" assertion for this route is
 * NOT attempted here, since it cannot be guaranteed against a DB every
 * other spec file may already have written pantry items/recipes into
 * (docs/stories/S-501-what-can-i-cook.md's own first-run-empty-state task
 * needs a fresh, unshared DB to be meaningful — out of scope for this
 * shared-DB e2e run; see hand-off notes for the follow-up this implies).
 *
 * Fixture shape (all MASS unit class, all quantities entered/compared in
 * "g" so no density/cross-class conversion is exercised — that's
 * domain/units.ts's job, not this page's):
 *   - Ingredient A: pantry has 500 g; Recipe "Cookable" needs 400 g ->
 *     fully satisfied (FR-20).
 *   - Ingredient B: pantry has 100 g; Recipe "Near Match" needs 300 g ->
 *     1 unsatisfied (INSUFFICIENT) line, shortfall 200 g (FR-22's own
 *     literal example, "need 200 g more <ingredient>").
 *   - Ingredients C and D: never added to the pantry at all (guaranteed
 *     MISSING). Recipe "Missing More" needs A (1000 g, exceeds the 500 g
 *     held), B (300 g, exceeds the 100 g held), C, and D -> 4 unsatisfied
 *     lines, which exceeds the default threshold (3) -> excluded from
 *     Near Match, counted only in the summarized tail (Flow C's render
 *     rule, NFR-2).
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Page (`/app/what-can-i-cook`, RSC):
 *   - `data-testid="cookable-now-section"` wraps a heading named exactly
 *     "Cookable Now" and zero-or-more `data-testid="cookable-recipe-row"`
 *     children. Each row contains the recipe's name as visible text and a
 *     `role="link"` whose `href` matches `/^\/recipes\/\d+$/`.
 *   - `data-testid="near-match-section"` wraps a heading named exactly
 *     "Near Match" and zero-or-more `data-testid="near-match-recipe-row"`
 *     children, ordered per FR-21. Each row contains the recipe's name,
 *     the same `role="link"` -> `/recipes/<id>` contract as a cookable
 *     row, and one `data-testid="unsatisfied-line"` per unsatisfied line.
 *     For a partial (INSUFFICIENT) line, that element's text matches
 *     `/need\s+200\s*g\s+more\s+<ingredient name>/i` (FR-22's exact
 *     literal phrasing, "need <shortfall> <unit> more <ingredient>").
 *   - `data-testid="missing-more-tail"` wraps `data-testid="missing-more-
 *     count"`, whose text is EXACTLY the integer count of recipes beyond
 *     the active threshold — summarized by count only, never rendered as
 *     individual rows (architecture §6 Flow C's render rule / NFR-2). A
 *     recipe excluded this way must NOT appear as a
 *     `cookable-recipe-row` or `near-match-recipe-row` anywhere on the
 *     page.
 * ===========================================================================
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ING_A_NAME = `E2E WCIC Ingredient A ${RUN_ID}`;
const ING_B_NAME = `E2E WCIC Ingredient B ${RUN_ID}`;
const ING_C_NAME = `E2E WCIC Ingredient C ${RUN_ID}`;
const ING_D_NAME = `E2E WCIC Ingredient D ${RUN_ID}`;
const COOKABLE_RECIPE_NAME = `E2E WCIC Cookable ${RUN_ID}`;
const NEAR_MATCH_RECIPE_NAME = `E2E WCIC Near Match ${RUN_ID}`;
const MISSING_MORE_RECIPE_NAME = `E2E WCIC Missing More ${RUN_ID}`;

async function createCustomIngredient(page: Page, name: string): Promise<void> {
  await page.goto("/ingredients/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add ingredient", exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByRole("combobox", { name: "Unit class" }).click();
  await page.getByRole("option", { name: "Mass", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Calories" }).fill("100");
  await page.getByRole("spinbutton", { name: "Protein" }).fill("5");
  await page.getByRole("spinbutton", { name: "Carbs" }).fill("10");
  await page.getByRole("spinbutton", { name: "Fat" }).fill("2");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/ingredients\/?$/);
}

async function openAddPantryDialog(page: Page): Promise<Locator> {
  const headerTrigger = page.getByRole("button", { name: "Add pantry item", exact: true });
  const emptyStateTrigger = page.getByRole("button", { name: "Add your first pantry item" });

  if (await headerTrigger.isVisible().catch(() => false)) {
    await headerTrigger.click();
  } else {
    await emptyStateTrigger.click();
  }

  const dialog = page.getByRole("dialog", { name: "Add pantry item" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function stockPantry(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  await page.goto("/pantry");
  const dialog = await openAddPantryDialog(page);

  const combobox = page.getByRole("combobox", { name: "Ingredient" });
  await combobox.click();
  await combobox.fill(ingredientName);
  await page.getByRole("option", { name: ingredientName, exact: true }).click();

  await dialog.getByLabel("Quantity").fill(quantity);
  await page.getByRole("combobox", { name: "Unit" }).click();
  await page.getByRole("option", { name: unit, exact: true }).click();

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();
}

async function ensureLineRowCount(page: Page, count: number): Promise<void> {
  const addButton = page.getByRole("button", { name: "Add ingredient line" });
  while ((await page.getByTestId("recipe-line-row").count()) < count) {
    await addButton.click();
  }
}

async function fillLine(
  page: Page,
  row: Locator,
  ingredientName: string,
  quantity: string,
  unit: string,
): Promise<void> {
  const ingredientInput = row.getByRole("textbox", { name: "Ingredient" });
  await ingredientInput.fill(ingredientName);

  const option = row.getByTestId("recipe-ingredient-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();

  await row.getByRole("spinbutton", { name: "Quantity" }).fill(quantity);
  await row.getByRole("combobox", { name: "Unit" }).click();
  await page.getByRole("option", { name: unit, exact: true }).click();
}

async function createRecipe(
  page: Page,
  name: string,
  lines: Array<{ ingredientName: string; quantity: string; unit: string }>,
): Promise<void> {
  await page.goto("/recipes/new");
  await expect(page.getByRole("heading", { level: 1, name: "New Recipe" })).toBeVisible();

  await page.getByRole("textbox", { name: "Recipe name" }).fill(name);
  await page.getByRole("spinbutton", { name: "Servings" }).fill("2");
  await page.getByRole("textbox", { name: "Instructions" }).fill("E2E fixture — combine and serve.");

  await ensureLineRowCount(page, lines.length);
  const rows = page.getByTestId("recipe-line-row");
  for (let i = 0; i < lines.length; i += 1) {
    await fillLine(page, rows.nth(i), lines[i].ingredientName, lines[i].quantity, lines[i].unit);
  }

  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
}

function cookableRowFor(page: Page, recipeName: string): Locator {
  return page.getByTestId("cookable-now-section").getByTestId("cookable-recipe-row").filter({ hasText: recipeName });
}

function nearMatchRowFor(page: Page, recipeName: string): Locator {
  return page.getByTestId("near-match-section").getByTestId("near-match-recipe-row").filter({ hasText: recipeName });
}

async function missingMoreCount(page: Page): Promise<number> {
  await page.goto("/what-can-i-cook");
  const text = await page.getByTestId("missing-more-count").innerText();
  const value = Number(text.trim());
  expect(Number.isFinite(value), `expected missing-more-count text to be a plain integer, got "${text}"`).toBe(true);
  return value;
}

test.describe("S-501 what can i cook", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "detailed WCIC ACs verified once on chromium");
  });

  test("setup: create fixture ingredients A/B, stock the pantry, and create the Cookable + Near Match recipes", async ({
    page,
  }) => {
    await createCustomIngredient(page, ING_A_NAME);
    await createCustomIngredient(page, ING_B_NAME);

    await stockPantry(page, ING_A_NAME, "500", "g");
    await stockPantry(page, ING_B_NAME, "100", "g");

    await createRecipe(page, COOKABLE_RECIPE_NAME, [{ ingredientName: ING_A_NAME, quantity: "400", unit: "g" }]);
    await createRecipe(page, NEAR_MATCH_RECIPE_NAME, [{ ingredientName: ING_B_NAME, quantity: "300", unit: "g" }]);
  });

  test("AC1/FR-20: a recipe fully satisfied by the pantry appears under Cookable Now and links to its detail page", async ({
    page,
  }) => {
    await page.goto("/what-can-i-cook");
    await expect(page.getByRole("heading", { level: 1, name: "What Can I Cook" })).toBeVisible();

    const section = page.getByTestId("cookable-now-section");
    await expect(section.getByRole("heading", { name: "Cookable Now", exact: true })).toBeVisible();

    const row = cookableRowFor(page, COOKABLE_RECIPE_NAME);
    await expect(row).toBeVisible();

    // Never also listed in Near Match.
    await expect(nearMatchRowFor(page, COOKABLE_RECIPE_NAME)).toHaveCount(0);

    const link = row.getByRole("link").first();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/recipes\/\d+$/);

    await link.click();
    await expect(page.getByRole("heading", { level: 1, name: COOKABLE_RECIPE_NAME })).toBeVisible();
  });

  test("AC2/AC3/FR-22: a partially-stocked recipe appears under Near Match with the exact shortfall phrasing, and links to its detail page", async ({
    page,
  }) => {
    await page.goto("/what-can-i-cook");

    const section = page.getByTestId("near-match-section");
    await expect(section.getByRole("heading", { name: "Near Match", exact: true })).toBeVisible();

    const row = nearMatchRowFor(page, NEAR_MATCH_RECIPE_NAME);
    await expect(row).toBeVisible();

    // Never also listed in Cookable Now.
    await expect(cookableRowFor(page, NEAR_MATCH_RECIPE_NAME)).toHaveCount(0);

    // FR-22's literal example, applied to this fixture: 300 g required,
    // 100 g held -> "need 200 g more <ingredient>".
    const unsatisfiedLine = row.getByTestId("unsatisfied-line");
    await expect(unsatisfiedLine.first()).toContainText(new RegExp(`need\\s+200\\s*g\\s+more\\s+${ING_B_NAME}`, "i"));

    const link = row.getByRole("link").first();
    const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/recipes\/\d+$/);

    await link.click();
    await expect(page.getByRole("heading", { level: 1, name: NEAR_MATCH_RECIPE_NAME })).toBeVisible();
  });

  test("missing-more tail: a recipe missing 4 lines (over the default threshold of 3) is never listed, but the summarized count increases by exactly 1", async ({
    page,
  }) => {
    const countBefore = await missingMoreCount(page);

    await createCustomIngredient(page, ING_C_NAME);
    await createCustomIngredient(page, ING_D_NAME);
    // C and D are deliberately never added to the pantry (guaranteed
    // MISSING). A is required far beyond its 500 g pantry stock; B is
    // required at the same insufficient amount as the Near Match recipe.
    await createRecipe(page, MISSING_MORE_RECIPE_NAME, [
      { ingredientName: ING_A_NAME, quantity: "1000", unit: "g" },
      { ingredientName: ING_B_NAME, quantity: "300", unit: "g" },
      { ingredientName: ING_C_NAME, quantity: "50", unit: "g" },
      { ingredientName: ING_D_NAME, quantity: "50", unit: "g" },
    ]);

    await page.goto("/what-can-i-cook");

    await expect(cookableRowFor(page, MISSING_MORE_RECIPE_NAME)).toHaveCount(0);
    await expect(nearMatchRowFor(page, MISSING_MORE_RECIPE_NAME)).toHaveCount(0);

    const countAfter = await missingMoreCount(page);
    expect(countAfter).toBe(countBefore + 1);
  });
});

test.describe("S-501 what can i cook at 375px (NFR-8)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-375", "375px assertions run only in the mobile-375 project");
  });

  test("the view has no horizontal scroll at 375px", async ({ page }) => {
    const response = await page.goto("/what-can-i-cook");
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: "What Can I Cook" })).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });
});
