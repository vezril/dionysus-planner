import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: drinks-and-abv — a DRINK-category product and a cocktail
 * recipe whose ABV is estimated from its ingredients.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const VODKA_NAME = `E2E Vodka ${RUN_ID}`;
const COCKTAIL_NAME = `E2E Screwdriver ${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("drinks and ABV", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("a DRINK product shows its category badge", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(VODKA_NAME);
    await dialog.getByRole("combobox", { name: "Category" }).click();
    await page.getByRole("option", { name: "Drink", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("231");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Alcohol" }).fill("31.6");
    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("750");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "mL", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();

    await page.getByTestId("pantry-row").filter({ hasText: VODKA_NAME }).getByRole("link").click();
    await expect(page.getByTestId("category-badge")).toHaveText("DRINK");
  });

  test("a cocktail recipe shows an estimated ABV", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(COCKTAIL_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("1");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Pour ");
    await insertMention(page, VODKA_NAME, "45", "mL");
    await textarea.pressSequentially("over ice with ");
    await insertMention(page, "Orange juice, fresh", "120", "mL");
    await textarea.pressSequentially("and stir.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: COCKTAIL_NAME }).getByRole("link").first().click();
    }

    // 45/100×31.6 = 14.22 g → /0.789 /165 mL ≈ 10.9%
    await expect(page.getByTestId("recipe-abv")).toContainText("10.9% ABV");
    await expect(page.getByTestId("recipe-abv")).toContainText("estimated");
  });
});
