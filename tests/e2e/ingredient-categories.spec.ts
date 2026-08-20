import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: ingredient-categories-auto-tags — custom categories on a
 * product flow through as automatic recipe tags: create a product with
 * categories, use it in a recipe, and the recipe list/detail carry the
 * tags without them appearing in the recipe's own edit form. No service
 * dependency; run-unique names like the other list specs.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SALMON_NAME = `E2E Cat Salmon ${RUN_ID}`;
const RECIPE_NAME = `E2E Cat Sear ${RUN_ID}`;
const FISH_TAG = `fish-${RUN_ID}`;
const SALMON_TAG = `salmon-${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("ingredient categories → auto recipe tags", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("a product saves categories and round-trips them on edit", async ({ page }) => {
    await page.goto("/ingredients/new");
    await page.getByRole("textbox", { name: "Name" }).fill(SALMON_NAME);
    await page.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Mass", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Calories" }).fill("208");
    await page.getByRole("spinbutton", { name: "Protein" }).fill("20");
    await page.getByRole("spinbutton", { name: "Carbs" }).fill("0");
    await page.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("13");
    await page.getByRole("textbox", { name: /Categories/ }).fill(`${FISH_TAG}, ${SALMON_TAG}`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/ingredients$/);

    const searchBox = page.getByRole("textbox", { name: "Search ingredients" });
    await searchBox.fill(SALMON_NAME);
    const row = page.getByTestId("ingredient-row").filter({ hasText: SALMON_NAME });
    await expect(row).toBeVisible();
    await row.getByRole("link").first().click();
    await expect(page.getByRole("textbox", { name: /Categories/ })).toHaveValue(`${FISH_TAG}, ${SALMON_TAG}`);
  });

  test("a recipe using the product inherits its categories as tags", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(RECIPE_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("2");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Sear ");
    await insertMention(page, SALMON_NAME, "300", "g");
    await textarea.pressSequentially("skin down.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);

    // List row carries both derived tags, and the tag filter matches.
    await page.goto("/recipes");
    await page.getByRole("textbox", { name: "Search recipes" }).fill(RECIPE_NAME);
    const row = page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME });
    await expect(row.getByTestId("recipe-row-tag").filter({ hasText: FISH_TAG })).toBeVisible();
    await expect(row.getByTestId("recipe-row-tag").filter({ hasText: SALMON_TAG })).toBeVisible();
    await page.getByTestId("tag-filter-chip").filter({ hasText: FISH_TAG }).click();
    await expect(row).toBeVisible();

    // Detail shows them as derived chips; the edit form holds no tags.
    await row.getByRole("link").first().click();
    await expect(page.getByTestId("recipe-derived-tag").filter({ hasText: FISH_TAG })).toBeVisible();
    await expect(page.getByTestId("recipe-derived-tag").filter({ hasText: SALMON_TAG })).toBeVisible();
    await page.getByRole("link", { name: "Edit recipe" }).click();
    await expect(page.getByRole("textbox", { name: "Tags" })).toBeVisible();
    await expect(page.getByTestId("recipe-tag-chip")).toHaveCount(0);
  });
});
