import { expect, test, type Page } from "@playwright/test";

/**
 * S-401 Recipe creation — acceptance criteria coverage
 * (docs/stories/S-401-recipe-create.md), UJ-2.
 *
 * Rewritten under openspec: cooklang-recipe-editor — the per-line
 * ingredient picker form is gone. The editor is now a single
 * "Instructions" textarea where the whole recipe is typed with inline
 * `@Name(id){quantity%unit}` mentions; typing `@query` opens
 * `data-testid="mention-suggestions"` (`data-testid="mention-option"`
 * buttons), and selecting one inserts `Name(id)` at the cursor.
 *
 * Test-isolation note: the e2e DB (`.dev-data/`) is persistent across this
 * whole `webServer` run — these tests do NOT assert an exact recipe count
 * anywhere; they assert only that THIS test's own uniquely-named recipe
 * appears.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Page `/app/recipes/new` (client editor):
 *   - One `<h1>` "New Recipe".
 *   - `getByRole("textbox", { name: "Recipe name" })` — name input.
 *   - `getByRole("spinbutton", { name: "Servings" })` — integer input.
 *   - `getByRole("textbox", { name: "Instructions" })` — the mention-aware
 *     body textarea.
 *   - Typing `@` followed by a substring of a seeded ingredient's name
 *     into "Instructions" opens `data-testid="mention-suggestions"`
 *     containing `data-testid="mention-option"` buttons named after
 *     matching ingredients; clicking one inserts `@Full Ingredient
 *     Name(id)` into the textarea at the query's position, replacing the
 *     typed query text.
 *   - `getByRole("button", { name: "Save recipe" })` — submits.
 *   - A body with zero valid `{quantity}`-bearing mentions keeps the user
 *     on `/recipes/new` and renders a visible inline message matching
 *     /at least (one|1) ingredient/i.
 *   - On success, the app redirects to either the new recipe's detail
 *     page (`/recipes/<id>`) or the list (`/recipes`); the recipe
 *     subsequently appears at `/recipes`.
 *
 * Page `/app/recipes` (list): one row per recipe, `data-testid=
 * "recipe-row"`, containing the recipe's name as visible text.
 * ============================================================================
 */

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 6)}`);

  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();

  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

// Distinctive, single-match seeded ingredient names (data/seed/seed-data.json,
// S-204) — chosen so a substring search narrows to exactly one candidate.
const GARLIC_INGREDIENT_NAME = "Garlic, 1 clove";
const OLIVE_OIL_INGREDIENT_NAME = "Olive oil, extra virgin";

test.describe("S-401 recipe creation", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("AC2/AC3: saving with no valid mentions is blocked with an inline validation message", async ({ page }) => {
    await page.goto("/recipes/new");
    await expect(page.getByRole("heading", { level: 1, name: "New Recipe" })).toBeVisible();

    const validationMessage = page.getByText(/at least (one|1) ingredient/i);
    await expect(validationMessage).toHaveCount(0);

    await page.getByRole("textbox", { name: "Recipe name" }).fill("Should Not Save");
    await page.getByRole("spinbutton", { name: "Servings" }).fill("2");
    await page.getByRole("textbox", { name: "Instructions" }).fill("Just stand there, no ingredients typed.");

    await page.getByRole("button", { name: "Save recipe" }).click();

    // Blocked: no navigation away from the editor.
    await expect(page).toHaveURL(/\/recipes\/new$/);
    await expect(validationMessage.first()).toBeVisible();
  });

  test("AC1/AC4/AC5: a valid recipe with two cross-unit-class mentions saves and appears in the recipe list", async ({
    page,
  }) => {
    const recipeName = `E2E Recipe ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    await page.goto("/recipes/new");

    await page.getByRole("textbox", { name: "Recipe name" }).fill(recipeName);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("3");

    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Combine ");
    await insertMention(page, GARLIC_INGREDIENT_NAME, "2", "g");
    await textarea.pressSequentially("and ");
    await insertMention(page, OLIVE_OIL_INGREDIENT_NAME, "1", "tbsp");
    await textarea.pressSequentially("then serve.");

    await page.getByRole("button", { name: "Save recipe" }).click();

    // Redirected to either the new recipe's detail page or the list — what's
    // pinned is that it appears at /recipes.
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

  test("the editor has no horizontal scroll and the Instructions field is usable", async ({ page }) => {
    const response = await page.goto("/recipes/new");
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: "New Recipe" })).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);

    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await expect(textarea).toBeVisible();
    const box = await textarea.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(375);
  });
});
