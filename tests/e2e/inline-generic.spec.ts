import { expect, test } from "@playwright/test";

/**
 * openspec: inline-generic-create — pick "New generic…" in the product
 * form's menu, name it, and the generic exists linked to the product.
 * No service dependency; run-unique names.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const PRODUCT = `E2E IG Lager ${RUN_ID}`;
const GENERIC = `E2E IG Beer ${RUN_ID}`;

test.describe("inline generic creation", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("New generic… from the menu creates and links it", async ({ page }) => {
    await page.goto("/ingredients/new");
    await page.getByRole("textbox", { name: "Name" }).fill(PRODUCT);
    await page.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await page.getByRole("combobox", { name: "Category" }).click();
    await page.getByRole("option", { name: "Drink", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Calories" }).fill("43");
    await page.getByRole("spinbutton", { name: "Protein" }).fill("0.5");
    await page.getByRole("spinbutton", { name: "Carbs" }).fill("3.6");
    await page.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("0");
    await page.getByRole("combobox", { name: "Generic of" }).click();
    await page.getByRole("option", { name: "＋ New generic…" }).click();
    await page.getByRole("textbox", { name: "New generic name" }).fill(GENERIC);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/ingredients$/);

    // The generic exists in the catalog…
    await page.getByRole("textbox", { name: "Search ingredients" }).fill(GENERIC);
    await expect(page.getByTestId("ingredient-row").filter({ hasText: GENERIC })).toBeVisible();

    // …and the product's edit page shows it linked.
    await page.getByRole("textbox", { name: "Search ingredients" }).fill(PRODUCT);
    await page.getByTestId("ingredient-row").filter({ hasText: PRODUCT }).getByRole("link").first().click();
    await expect(page.getByRole("combobox", { name: "Generic of" })).toContainText(GENERIC);
  });
});
