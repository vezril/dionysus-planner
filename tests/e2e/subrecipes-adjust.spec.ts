import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: subrecipes-consume-qol — [[sub-recipe]] links author via the
 * editor's `[[` autocomplete and click through on the detail page, and
 * pantry rows quick-adjust with ¾/½/¼/Out presets. No service
 * dependency; run-unique names.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SPICE_NAME = `E2E SR Paprika ${RUN_ID}`;
const SUB_RECIPE = `E2E SR Cajun Mix ${RUN_ID}`;
const PARENT_RECIPE = `E2E SR Cajun Chicken ${RUN_ID}`;
const RICE_NAME = `E2E SR Rice ${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

async function createRecipe(page: Page, name: string, extraTyping?: (page: Page) => Promise<void>): Promise<void> {
  await page.goto("/recipes/new");
  await page.getByRole("textbox", { name: "Recipe name" }).fill(name);
  await page.getByRole("spinbutton", { name: "Servings" }).fill("2");
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.click();
  await textarea.pressSequentially("Mix ");
  await insertMention(page, SPICE_NAME, "5", "g");
  if (extraTyping) await extraTyping(page);
  await textarea.pressSequentially("well.");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
}

test.describe("sub-recipe links + quick adjust", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: spice product, rice pantry item, and the sub-recipe", async ({ page }) => {
    await page.goto("/pantry");
    for (const [name, grams] of [
      [SPICE_NAME, "100"],
      [RICE_NAME, "296"],
    ] as const) {
      await page.getByRole("button", { name: "Create custom item" }).click();
      const dialog = page.getByRole("dialog", { name: "Create custom item" });
      await dialog.getByRole("textbox", { name: "Name" }).fill(name);
      await dialog.getByRole("combobox", { name: "Unit class" }).click();
      await page.getByRole("option", { name: "Mass", exact: true }).click();
      await dialog.getByRole("spinbutton", { name: "Calories" }).fill("300");
      await dialog.getByRole("spinbutton", { name: "Protein" }).fill("10");
      await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("50");
      await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("5");
      await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill(grams);
      await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
      await page.getByRole("option", { name: "g", exact: true }).click();
      await dialog.getByRole("button", { name: "Create item" }).click();
      await expect(dialog).not.toBeVisible();
    }
    await createRecipe(page, SUB_RECIPE);
  });

  test("the parent authors a [[sub-recipe]] via the [[ autocomplete and links through", async ({ page }) => {
    await createRecipe(page, PARENT_RECIPE, async () => {
      const textarea = page.getByRole("textbox", { name: "Instructions" });
      await textarea.pressSequentially(`then [[${SUB_RECIPE.slice(0, 14)}`);
      const option = page.getByTestId("recipe-ref-option").filter({ hasText: SUB_RECIPE });
      await expect(option.first()).toBeVisible();
      await option.first().click();
      await textarea.pressSequentially(" ");
    });

    // Open the parent's detail page and click the sub-recipe link.
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByRole("textbox", { name: "Search recipes" }).fill(PARENT_RECIPE);
      await page.getByTestId("recipe-row").filter({ hasText: PARENT_RECIPE }).getByRole("link").first().click();
    }
    const link = page.getByTestId("subrecipe-link");
    await expect(link).toHaveText(SUB_RECIPE);
    await link.click();
    await expect(page.getByRole("heading", { level: 1, name: SUB_RECIPE })).toBeVisible();
    await expect(page.getByTestId("cook-recipe")).toBeVisible(); // ready to make it
  });

  test("quick adjust halves the rice then marks it out", async ({ page }) => {
    await page.goto("/pantry");
    const row = page.getByTestId("pantry-row").filter({ hasText: RICE_NAME });
    await expect(row).toContainText("296 g");

    await row.getByTestId("adjust-quantity").click();
    await row.getByTestId("adjust-½").click();
    await expect(row).toContainText("148 g");

    await row.getByTestId("adjust-quantity").click();
    await row.getByTestId("adjust-out").click();
    await expect(row.getByTestId("out-of-stock")).toBeVisible();
  });
});
