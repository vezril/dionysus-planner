import { expect, test } from "@playwright/test";

/**
 * openspec: alcohol-tracking — the Alcohol field flows from the custom-item
 * dialog to the pantry detail page's nutrition facts.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const BEER_NAME = `E2E Beer ${RUN_ID}`;

test.describe("alcohol tracking", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("a custom item's alcohol shows on the detail page", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(BEER_NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("43");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("0.5");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("3.6");
    await dialog.getByRole("spinbutton", { name: "Fat" }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Alcohol" }).fill("3.9");
    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("355");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "mL", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();

    await page.getByTestId("pantry-row").filter({ hasText: BEER_NAME }).getByRole("link").click();
    await expect(page.getByTestId("nutrition-alcohol")).toHaveText("3.9 g");
  });
});
