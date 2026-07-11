import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * S-406 Recipe list sort + cookability filter — end-to-end wiring coverage
 * (docs/stories/S-406-recipe-list-sort-filter.md AC1-AC4, prd.md FR-26,
 * FR-27, architecture.md §6 Flow D).
 *
 * Readiness-gate note (per the story fix): the tri-key sort COMPARATOR and
 * the cookability status PREDICATE are unit-tested in isolation at
 * tests/unit/domain/listFilters.test.ts (`sortRecipes`, `matchesStatus`),
 * and the annotation ASSEMBLY (calories/serving + cookability landing on
 * the right recipe) is wiring-tested at
 * tests/integration/recipe-list-data.test.ts (`listRecipeSummariesAnnotated`).
 * This suite is deliberately "thin wiring" on top of BOTH — it does not
 * re-derive comparator edge cases or annotation math; it proves `/recipes`
 * actually has sort + cookability-filter controls, wired to those
 * already-tested pieces, and that they compose with the existing name
 * search (S-404).
 *
 * None of the following exist yet on `/app/recipes/page.tsx` or
 * `app/recipes/_components/recipe-catalog.tsx`: sort controls, a
 * cookability filter control, or cookability badges on each row — every
 * test below is intentionally RED (missing elements/timeouts) until the
 * implementer builds them per this file's pinned contract, delegating
 * ordering/membership to `domain/listFilters.ts`'s `sortRecipes`/
 * `matchesStatus` and the annotated data from
 * `data/recipes.ts#listRecipeSummariesAnnotated`.
 *
 * Test-isolation note (same discipline as tests/e2e/recipe-tags.spec.ts,
 * tests/e2e/what-can-i-cook.spec.ts): the e2e DB is persistent and shared
 * across this whole `webServer` run and every other spec file
 * (`fullyParallel: true`). Every fixture recipe/ingredient name below is
 * suffixed with a run-unique token; ordering assertions only ever compare
 * the RELATIVE order of THIS run's own rows within the full (possibly
 * much longer) row list — never an exact total count or absolute position.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Page `/app/recipes` (RSC + client list island, extending S-404/S-405):
 *   - `getByRole("combobox", { name: "Sort by" })` — options exactly
 *     "Name", "Servings", "Calories per serving" (S-406 AC2).
 *   - `getByRole("combobox", { name: "Sort direction" })` — options
 *     exactly "Ascending", "Descending".
 *   - Changing either control re-orders the visible `recipe-row` elements
 *     client-side (no navigation/round-trip), delegating to
 *     `domain/listFilters.ts#sortRecipes`. A recipe whose calories-per-
 *     serving is incomplete (nutrition-incomplete, FR-19) sorts to the
 *     END under the "Calories per serving" key in EITHER direction
 *     (readiness-gate rule).
 *   - `getByRole("combobox", { name: "Cookability" })` — options exactly
 *     "All", "Cookable Now", "Near Match", "Missing More" (S-406 AC3,
 *     FR-26). Selecting one narrows the visible `recipe-row` elements to
 *     that subset, delegating to `domain/listFilters.ts#matchesStatus`;
 *     "All" restores every row.
 *   - Each `recipe-row` contains `data-testid="cookability-badge"` whose
 *     text is EXACTLY one of "Cookable Now" / "Near Match" / "Missing
 *     More", computed server-side (Flow D, `computeCookableAndNearMatch`
 *     via `listRecipeSummariesAnnotated`) — never absent.
 *   - The cookability filter composes with the existing "Search recipes"
 *     name-search box (S-406 AC4): both constraints apply together,
 *     without a server round-trip.
 * ===========================================================================
 *
 * Scoped to chromium only, mirroring tests/e2e/recipe-list.spec.ts and
 * tests/e2e/recipe-tags.spec.ts's own story-level e2e task split.
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// --- Sort fixtures: one custom ingredient at a clean 100 kcal/100 g, four
// recipes with distinct, hand-computable (servings, caloriesPerServing)
// combinations, chosen so name-alphabetical order ALSO differs from both
// servings order and calories order (no key's ordering is a coincidental
// match for another's).
const SORT_ING_NAME = `E2E Sort Ingredient ${RUN_ID}`;
const ALPHA_NAME = `Alpha Sort ${RUN_ID}`; // servings=2, 100 g -> 100 kcal total -> 50 kcal/serving
const BETA_NAME = `Beta Sort ${RUN_ID}`; // servings=8, 800 g -> 800 kcal total -> 100 kcal/serving
const GAMMA_NAME = `Gamma Sort ${RUN_ID}`; // servings=5, 100 g -> 100 kcal total -> 20 kcal/serving
const DELTA_NAME = `Delta Sort ${RUN_ID}`; // incomplete calories (unresolved line) -> must sort last always

// --- Cookability fixtures.
const COOKABLE_ING_NAME = `E2E Cookability Cookable Ing ${RUN_ID}`;
const NEAR_MATCH_ING_NAME = `E2E Cookability Near Ing ${RUN_ID}`;
const MISSING_ING_A_NAME = `E2E Cookability Missing A ${RUN_ID}`;
const MISSING_ING_B_NAME = `E2E Cookability Missing B ${RUN_ID}`;
const MISSING_ING_C_NAME = `E2E Cookability Missing C ${RUN_ID}`;
const MISSING_ING_D_NAME = `E2E Cookability Missing D ${RUN_ID}`;
const COOKABLE_RECIPE_NAME = `E2E Cookability Cookable Now ${RUN_ID}`;
const NEAR_MATCH_RECIPE_NAME = `E2E Cookability Near Match ${RUN_ID}`;
const MISSING_MORE_RECIPE_NAME = `E2E Cookability Missing More ${RUN_ID}`;

// Same seeded, density-less fixture ingredient tests/e2e/recipe-detail.spec.ts
// uses to force an UNRESOLVED (nutrition-incomplete) line: MASS-primary,
// densityGPerMl null, so entering it in a VOLUME unit cannot be resolved.
const TOMATOES_CHERRY = "Tomatoes, cherry";

async function createCustomIngredient(page: Page, name: string, calories = "100"): Promise<void> {
  await page.goto("/ingredients/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add ingredient", exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByRole("combobox", { name: "Unit class" }).click();
  await page.getByRole("option", { name: "Mass", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Calories" }).fill(calories);
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
  servings: string,
  lines: Array<{ ingredientName: string; quantity: string; unit: string }>,
): Promise<void> {
  await page.goto("/recipes/new");
  await expect(page.getByRole("heading", { level: 1, name: "New Recipe" })).toBeVisible();

  await page.getByRole("textbox", { name: "Recipe name" }).fill(name);
  await page.getByRole("spinbutton", { name: "Servings" }).fill(servings);
  await page.getByRole("textbox", { name: "Instructions" }).fill("E2E fixture — combine and serve.");

  await ensureLineRowCount(page, lines.length);
  const rows = page.getByTestId("recipe-line-row");
  for (let i = 0; i < lines.length; i += 1) {
    await fillLine(page, rows.nth(i), lines[i].ingredientName, lines[i].quantity, lines[i].unit);
  }

  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
}

/** Row names, in DOM order, narrowed down to just this run's own fixture names. */
async function orderedRunNames(page: Page, names: string[]): Promise<string[]> {
  const rowTexts = await page.getByTestId("recipe-row").allTextContents();
  const found: string[] = [];
  for (const text of rowTexts) {
    const match = names.find((name) => text.includes(name));
    if (match) found.push(match);
  }
  return found;
}

function rowFor(page: Page, recipeName: string): Locator {
  return page.getByTestId("recipe-row").filter({ hasText: recipeName });
}

async function selectSortBy(page: Page, option: "Name" | "Servings" | "Calories per serving"): Promise<void> {
  await page.getByRole("combobox", { name: "Sort by" }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function selectSortDirection(page: Page, option: "Ascending" | "Descending"): Promise<void> {
  await page.getByRole("combobox", { name: "Sort direction" }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function selectCookabilityFilter(
  page: Page,
  option: "All" | "Cookable Now" | "Near Match" | "Missing More",
): Promise<void> {
  await page.getByRole("combobox", { name: "Cookability" }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe("S-406 recipe list sort + cookability filter", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: create the sort fixtures (distinct name/servings/calories combinations, one nutrition-incomplete)", async ({
    page,
  }) => {
    await createCustomIngredient(page, SORT_ING_NAME, "100");

    // Alpha: servings=2, 100 g -> 100 kcal total -> 50 kcal/serving.
    await createRecipe(page, ALPHA_NAME, "2", [{ ingredientName: SORT_ING_NAME, quantity: "100", unit: "g" }]);
    // Beta: servings=8, 800 g -> 800 kcal total -> 100 kcal/serving.
    await createRecipe(page, BETA_NAME, "8", [{ ingredientName: SORT_ING_NAME, quantity: "800", unit: "g" }]);
    // Gamma: servings=5, 100 g -> 100 kcal total -> 20 kcal/serving.
    await createRecipe(page, GAMMA_NAME, "5", [{ ingredientName: SORT_ING_NAME, quantity: "100", unit: "g" }]);
    // Delta: nutrition-incomplete (Tomatoes, cherry entered in cups — no
    // density, cannot resolve — mirrors tests/e2e/recipe-detail.spec.ts).
    await createRecipe(page, DELTA_NAME, "3", [{ ingredientName: TOMATOES_CHERRY, quantity: "1", unit: "cup" }]);
  });

  test("setup: create the cookability fixtures (one cookable, one near-match, one missing-more)", async ({
    page,
  }) => {
    await createCustomIngredient(page, COOKABLE_ING_NAME);
    await createCustomIngredient(page, NEAR_MATCH_ING_NAME);
    await createCustomIngredient(page, MISSING_ING_A_NAME);
    await createCustomIngredient(page, MISSING_ING_B_NAME);
    await createCustomIngredient(page, MISSING_ING_C_NAME);
    await createCustomIngredient(page, MISSING_ING_D_NAME);

    await stockPantry(page, COOKABLE_ING_NAME, "500", "g");
    await stockPantry(page, NEAR_MATCH_ING_NAME, "100", "g");
    // MISSING_ING_A..D are deliberately never stocked.

    await createRecipe(page, COOKABLE_RECIPE_NAME, "2", [
      { ingredientName: COOKABLE_ING_NAME, quantity: "400", unit: "g" },
    ]);
    await createRecipe(page, NEAR_MATCH_RECIPE_NAME, "2", [
      { ingredientName: NEAR_MATCH_ING_NAME, quantity: "300", unit: "g" },
    ]);
    await createRecipe(page, MISSING_MORE_RECIPE_NAME, "2", [
      { ingredientName: MISSING_ING_A_NAME, quantity: "50", unit: "g" },
      { ingredientName: MISSING_ING_B_NAME, quantity: "50", unit: "g" },
      { ingredientName: MISSING_ING_C_NAME, quantity: "50", unit: "g" },
      { ingredientName: MISSING_ING_D_NAME, quantity: "50", unit: "g" },
    ]);
  });

  test("AC2: /recipes has \"Sort by\" and \"Sort direction\" controls", async ({ page }) => {
    const response = await page.goto("/recipes");
    expect(response?.ok()).toBe(true);

    await expect(page.getByRole("combobox", { name: "Sort by" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Sort direction" })).toBeVisible();
  });

  test("AC2: sorting by Name orders these fixtures alphabetically, asc and desc", async ({ page }) => {
    await page.goto("/recipes");
    const names = [ALPHA_NAME, BETA_NAME, GAMMA_NAME, DELTA_NAME];

    await selectSortBy(page, "Name");
    await selectSortDirection(page, "Ascending");
    await expect(async () => {
      expect(await orderedRunNames(page, names)).toEqual([ALPHA_NAME, BETA_NAME, DELTA_NAME, GAMMA_NAME]);
    }).toPass({ timeout: 500 });

    await selectSortDirection(page, "Descending");
    await expect(async () => {
      expect(await orderedRunNames(page, names)).toEqual([GAMMA_NAME, DELTA_NAME, BETA_NAME, ALPHA_NAME]);
    }).toPass({ timeout: 500 });
  });

  test("AC2: sorting by Servings orders these fixtures numerically, asc and desc", async ({ page }) => {
    await page.goto("/recipes");
    // Servings: Alpha=2, Gamma=5, Beta=8, Delta=3.
    const names = [ALPHA_NAME, BETA_NAME, GAMMA_NAME, DELTA_NAME];

    await selectSortBy(page, "Servings");
    await selectSortDirection(page, "Ascending");
    await expect(async () => {
      expect(await orderedRunNames(page, names)).toEqual([ALPHA_NAME, DELTA_NAME, GAMMA_NAME, BETA_NAME]);
    }).toPass({ timeout: 500 });

    await selectSortDirection(page, "Descending");
    await expect(async () => {
      expect(await orderedRunNames(page, names)).toEqual([BETA_NAME, GAMMA_NAME, DELTA_NAME, ALPHA_NAME]);
    }).toPass({ timeout: 500 });
  });

  test("AC2/readiness-gate: sorting by Calories per serving orders numerically, and the nutrition-incomplete recipe ALWAYS lands last (asc AND desc)", async ({
    page,
  }) => {
    await page.goto("/recipes");
    // Calories/serving: Gamma=20, Alpha=50, Beta=100, Delta=incomplete (null).
    const names = [ALPHA_NAME, BETA_NAME, GAMMA_NAME, DELTA_NAME];

    await selectSortBy(page, "Calories per serving");
    await selectSortDirection(page, "Ascending");
    await expect(async () => {
      expect(await orderedRunNames(page, names)).toEqual([GAMMA_NAME, ALPHA_NAME, BETA_NAME, DELTA_NAME]);
    }).toPass({ timeout: 500 });

    await selectSortDirection(page, "Descending");
    await expect(async () => {
      // Descending among the COMPLETE items reverses (Beta, Alpha, Gamma),
      // but Delta (incomplete) stays LAST, never jumping to the front.
      expect(await orderedRunNames(page, names)).toEqual([BETA_NAME, ALPHA_NAME, GAMMA_NAME, DELTA_NAME]);
    }).toPass({ timeout: 500 });
  });

  test("AC1/AC3: each fixture row shows the right cookability badge (Cookable Now / Near Match / Missing More)", async ({
    page,
  }) => {
    await page.goto("/recipes");

    await expect(rowFor(page, COOKABLE_RECIPE_NAME).getByTestId("cookability-badge")).toHaveText("Cookable Now");
    await expect(rowFor(page, NEAR_MATCH_RECIPE_NAME).getByTestId("cookability-badge")).toHaveText("Near Match");
    await expect(rowFor(page, MISSING_MORE_RECIPE_NAME).getByTestId("cookability-badge")).toHaveText(
      "Missing More",
    );
  });

  test("AC3: the Cookability filter narrows the list to exactly the selected status, and \"All\" restores every row", async ({
    page,
  }) => {
    await page.goto("/recipes");

    await expect(page.getByRole("combobox", { name: "Cookability" })).toBeVisible();

    const cookableRow = rowFor(page, COOKABLE_RECIPE_NAME);
    const nearMatchRow = rowFor(page, NEAR_MATCH_RECIPE_NAME);
    const missingMoreRow = rowFor(page, MISSING_MORE_RECIPE_NAME);

    await expect(cookableRow).toHaveCount(1);
    await expect(nearMatchRow).toHaveCount(1);
    await expect(missingMoreRow).toHaveCount(1);

    await selectCookabilityFilter(page, "Cookable Now");
    await expect(async () => {
      await expect(cookableRow).toHaveCount(1);
      await expect(nearMatchRow).toHaveCount(0);
      await expect(missingMoreRow).toHaveCount(0);
    }).toPass({ timeout: 300 });

    await selectCookabilityFilter(page, "Near Match");
    await expect(async () => {
      await expect(cookableRow).toHaveCount(0);
      await expect(nearMatchRow).toHaveCount(1);
      await expect(missingMoreRow).toHaveCount(0);
    }).toPass({ timeout: 300 });

    await selectCookabilityFilter(page, "Missing More");
    await expect(async () => {
      await expect(cookableRow).toHaveCount(0);
      await expect(nearMatchRow).toHaveCount(0);
      await expect(missingMoreRow).toHaveCount(1);
    }).toPass({ timeout: 300 });

    await selectCookabilityFilter(page, "All");
    await expect(async () => {
      await expect(cookableRow).toHaveCount(1);
      await expect(nearMatchRow).toHaveCount(1);
      await expect(missingMoreRow).toHaveCount(1);
    }).toPass({ timeout: 300 });
  });

  test("AC4: the Cookability filter composes with the name search — both constraints apply together", async ({
    page,
  }) => {
    await page.goto("/recipes");

    await selectCookabilityFilter(page, "Cookable Now");
    await expect(async () => {
      await expect(rowFor(page, COOKABLE_RECIPE_NAME)).toHaveCount(1);
    }).toPass({ timeout: 300 });

    // A search term matching a DIFFERENT (non-cookable) fixture, while the
    // "Cookable Now" filter is active, must show ZERO rows — the search
    // term alone would match nothing else, proving both constraints apply
    // together rather than either alone.
    await page.getByRole("textbox", { name: "Search recipes" }).fill(NEAR_MATCH_RECIPE_NAME);
    await expect(async () => {
      await expect(rowFor(page, COOKABLE_RECIPE_NAME)).toHaveCount(0);
      await expect(rowFor(page, NEAR_MATCH_RECIPE_NAME)).toHaveCount(0);
    }).toPass({ timeout: 300 });

    // Searching for the cookable-now fixture's own name, filter still
    // active, shows exactly that one row.
    await page.getByRole("textbox", { name: "Search recipes" }).fill(COOKABLE_RECIPE_NAME);
    await expect(async () => {
      await expect(rowFor(page, COOKABLE_RECIPE_NAME)).toHaveCount(1);
    }).toPass({ timeout: 300 });
  });
});
