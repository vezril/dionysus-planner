import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: generic-products — two branded butters linked to a generic:
 * aggregate cookability, forced cook-time choice, chosen row consumed.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const GENERIC_NAME = `E2E Butter ${RUN_ID}`;
const BRAND_A = `E2E Lactantia ${RUN_ID}`;
const BRAND_B = `E2E Kirkland ${RUN_ID}`;
const RECIPE_NAME = `E2E Butter Cookies ${RUN_ID}`;

async function createItem(page: Page, name: string, grams: string, genericName?: string) {
  await page.goto("/pantry");
  await page.getByRole("button", { name: "Create custom item" }).click();
  const dialog = page.getByRole("dialog", { name: "Create custom item" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("combobox", { name: "Unit class" }).click();
  await page.getByRole("option", { name: "Mass", exact: true }).click();
  if (genericName) {
    await dialog.getByRole("combobox", { name: "Generic of" }).click();
    await page.getByRole("option", { name: genericName, exact: true }).click();
  }
  await dialog.getByRole("spinbutton", { name: "Calories" }).fill("717");
  await dialog.getByRole("spinbutton", { name: "Protein" }).fill("0.9");
  await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("0.1");
  await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("81");
  await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill(grams);
  await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
  await page.getByRole("option", { name: "g", exact: true }).click();
  await dialog.getByRole("button", { name: "Create item" }).click();
  await expect(dialog).not.toBeVisible();
}

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("generic products", () => {
  test.skip(!process.env.DIONYSUS_SERVICE_URL, "cook confirm requires a live DIONYSUS_SERVICE_URL");
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: a generic and two linked branded butters", async ({ page }) => {
    await createItem(page, GENERIC_NAME, "0");
    await createItem(page, BRAND_A, "150", GENERIC_NAME);
    await createItem(page, BRAND_B, "150", GENERIC_NAME);

    // Detail page shows the generic link.
    await page.getByTestId("pantry-row").filter({ hasText: BRAND_A }).getByRole("link").click();
    await expect(page.getByTestId("product-generic")).toHaveText(GENERIC_NAME);
  });

  test("a generic-line recipe is cookable from branded stock and cooking demands a pick", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(RECIPE_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("1");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Cream ");
    await insertMention(page, GENERIC_NAME, "200", "g");
    await textarea.pressSequentially("with sugar.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME }).getByRole("link").first().click();
    }

    await page.getByTestId("cook-recipe").click();
    const dialog = page.getByRole("dialog", { name: /cook/i });
    await expect(dialog.getByTestId("cook-line-status-choice")).toBeVisible();
    // Confirm is blocked until a product is picked.
    await expect(dialog.getByTestId("cook-confirm")).toBeDisabled();
    await dialog.getByTestId("product-choice").getByRole("radio", { name: new RegExp(BRAND_A) }).check();
    await dialog.getByRole("spinbutton", { name: "Eating now" }).fill("0");
    await dialog.getByTestId("cook-confirm").click();
    await expect(dialog.getByTestId("cook-result")).toBeVisible();

    // Chosen brand consumed to zero (200 needed vs 150 held); other untouched.
    await page.goto("/pantry");
    const rowA = page.getByTestId("pantry-row").filter({ hasText: BRAND_A });
    await expect(rowA.getByTestId("out-of-stock")).toBeVisible();
    await expect(page.getByTestId("pantry-row").filter({ hasText: BRAND_B })).toContainText("150 g");
  });
});
