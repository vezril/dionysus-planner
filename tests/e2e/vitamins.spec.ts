import { expect, test } from "@playwright/test";

/**
 * openspec: vitamin-tracking — a supplement is a COUNT custom item with
 * micronutrient rows; the detail page shows only what's present.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SUPPLEMENT_NAME = `E2E Vitamin D3 ${RUN_ID}`;

test.describe("vitamin tracking", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("a COUNT supplement with vitamin D shows on its detail page", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(SUPPLEMENT_NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Count", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("0");

    await dialog.getByRole("button", { name: "Add micronutrient" }).click();
    await dialog.getByRole("combobox", { name: "Micronutrient" }).click();
    await page.getByRole("option", { name: /Vitamin D/ }).click();
    await dialog.getByRole("spinbutton", { name: "Micronutrient amount" }).fill("25");

    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("90");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "each", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();

    await page.getByTestId("pantry-row").filter({ hasText: SUPPLEMENT_NAME }).getByRole("link").click();
    const facts = page.getByTestId("micronutrient-facts");
    await expect(facts).toBeVisible();
    await expect(facts.getByTestId("micronutrient-vitaminD")).toHaveText("25 µg");
    // Only the entered nutrient renders.
    await expect(facts.getByTestId("micronutrient-vitaminC")).toHaveCount(0);
  });
});
