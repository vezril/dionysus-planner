import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * S-401 Recipe creation — acceptance criteria coverage
 * (docs/stories/S-401-recipe-create.md), UJ-2.
 *
 * `/app/recipes/new/page.tsx` does not exist yet (only the S-105
 * `/recipes` list placeholder does) — every test below is intentionally
 * RED (404 / missing elements) until the implementer builds the client
 * recipe editor + `createRecipe` Server Action + the `/recipes` list's
 * first real (non-placeholder) content.
 *
 * Test-isolation note: the e2e DB (`.dev-data/`) is persistent across this
 * whole `webServer` run (and across repeated local runs) — these tests do
 * NOT assert an exact recipe count anywhere; they assert only that THIS
 * test's own uniquely-named recipe appears. No delete exists until S-402,
 * so recipes created here are expected to accumulate in dev data.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Page `/app/recipes/new` (client editor):
 *   - One `<h1>` "New Recipe".
 *   - `getByRole("textbox", { name: "Recipe name" })` — name input.
 *   - `getByRole("spinbutton", { name: "Servings" })` — integer input.
 *   - `getByRole("textbox", { name: "Instructions" })` — free-text textarea.
 *   - `getByRole("button", { name: "Add ingredient line" })` — appends one
 *     line row. The editor MAY start with 0 or 1 row by default; these
 *     tests only ever grow the row count via this button, never assume a
 *     specific starting count.
 *   - Each line row carries `data-testid="recipe-line-row"`. Within a row:
 *     - `row.getByRole("textbox", { name: "Ingredient" })` — the ingredient
 *       search input (reuses `/api/ingredients?q=`, S-301's reusable
 *       picker backend). Typing a substring of a seeded ingredient's name
 *       surfaces matching candidates as `data-testid="recipe-ingredient-option"`
 *       elements (within the row) whose text contains the ingredient's
 *       full name; clicking one selects that ingredient for the line.
 *     - `row.getByRole("spinbutton", { name: "Quantity" })` — quantity
 *       input.
 *     - `row.getByRole("combobox", { name: "Unit" })` — a Select trigger
 *       (shadcn/Radix — `role="combobox"` on the trigger by construction);
 *       opens a `role="listbox"` of `role="option"` items named after each
 *       `domain/units.ts` UNITS key (e.g. "g", "tbsp", "cup").
 *   - `getByRole("button", { name: "Save recipe" })` — submits.
 *   - 0 completed lines (or any other blocking validation failure) keeps
 *     the user on `/recipes/new` and renders a visible inline message
 *     matching /at least (one|1) ingredient/i — not just relying on the
 *     "Add ingredient line" button's own label, which also contains the
 *     word "ingredient" (hence the more specific regex).
 *   - On success, the app either redirects to the new recipe's detail page
 *     (`/recipes/<id>`) or to the list (`/recipes`) — the story leaves the
 *     exact target open; the concrete, pinned assertion is that the
 *     recipe subsequently appears at `/recipes`.
 *
 * Page `/app/recipes` (list — gets its first real, non-placeholder content
 * in THIS story per AC1 "appears in the recipe list"; the full search/sort/
 * filter feature set is S-404/S-406's job, not this one's):
 *   - One row per recipe, `data-testid="recipe-row"`, containing the
 *     recipe's name as visible text.
 * ============================================================================
 */

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

// Distinctive, single-match seeded ingredient names (data/seed/seed-data.json,
// S-204) — chosen so a substring search narrows to exactly one candidate.
const GARLIC_INGREDIENT_NAME = "Garlic, 1 clove";
const OLIVE_OIL_INGREDIENT_NAME = "Olive oil, extra virgin";

test.describe("S-401 recipe creation", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("AC2/AC3: saving with no completed ingredient lines is blocked with an inline validation message", async ({
    page,
  }) => {
    await page.goto("/recipes/new");
    await expect(page.getByRole("heading", { level: 1, name: "New Recipe" })).toBeVisible();

    const validationMessage = page.getByText(/at least (one|1) ingredient/i);
    await expect(validationMessage).toHaveCount(0);

    await page.getByRole("textbox", { name: "Recipe name" }).fill("Should Not Save");
    await page.getByRole("spinbutton", { name: "Servings" }).fill("2");
    await page.getByRole("textbox", { name: "Instructions" }).fill("n/a");

    await page.getByRole("button", { name: "Save recipe" }).click();

    // Blocked: no navigation away from the editor.
    await expect(page).toHaveURL(/\/recipes\/new$/);
    await expect(validationMessage.first()).toBeVisible();
  });

  test("AC1/AC4/AC5: a valid recipe with two cross-unit-class ingredient lines saves and appears in the recipe list", async ({
    page,
  }) => {
    const recipeName = `E2E Recipe ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    await page.goto("/recipes/new");

    await page.getByRole("textbox", { name: "Recipe name" }).fill(recipeName);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("3");
    await page.getByRole("textbox", { name: "Instructions" }).fill("Combine and serve.");

    await ensureLineRowCount(page, 2);
    const rows = page.getByTestId("recipe-line-row");

    await fillLine(page, rows.nth(0), GARLIC_INGREDIENT_NAME, "2", "g");
    await fillLine(page, rows.nth(1), OLIVE_OIL_INGREDIENT_NAME, "1", "tbsp");

    await page.getByRole("button", { name: "Save recipe" }).click();

    // Redirected to either the new recipe's detail page or the list — the
    // story leaves the exact target open (S-403 owns the detail page's
    // real build-out); what's pinned is that it appears at /recipes.
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);

    if (!/\/recipes$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
    }

    const recipeRow = page.getByTestId("recipe-row").filter({ hasText: recipeName });
    await expect(recipeRow.first()).toBeVisible();
  });
});

test.describe("S-401 recipe editor at 375px (NFR-8)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-375", "375px assertions run only in the mobile-375 project");
  });

  test("the editor has no horizontal scroll and a line row is usable", async ({ page }) => {
    const response = await page.goto("/recipes/new");
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: "New Recipe" })).toBeVisible();

    await ensureLineRowCount(page, 1);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);

    const row = page.getByTestId("recipe-line-row").first();
    await expect(row).toBeVisible();
    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(375);
  });
});
