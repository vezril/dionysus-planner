import { expect, test } from "@playwright/test";

/**
 * openspec: pantry-freshness — a short-shelf-life item shows its age and
 * an expiring hint straight from creation ("stocked today", shelf life 2
 * → "~2d left" expiring badge, since 2 ≤ the 3-day window).
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const MILK_NAME = `E2E Fresh Milk ${RUN_ID}`;

test.describe("pantry freshness", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("a short-shelf-life item shows age and an expiring badge", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(MILK_NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("42");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("3.4");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("5");
    await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("1");
    await dialog.getByRole("spinbutton", { name: "Shelf life (days)" }).fill("2");
    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("1000");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "mL", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();

    const row = page.getByTestId("pantry-row").filter({ hasText: MILK_NAME });
    await expect(row.getByTestId("stocked-age")).toHaveText("stocked today");
    await expect(row.getByTestId("freshness-expiring")).toHaveText("~2d left");

    await row.getByRole("link", { name: MILK_NAME }).click();
    await expect(page.getByTestId("pantry-detail-freshness")).toContainText("stocked today");
    await expect(page.getByTestId("pantry-detail-freshness")).toContainText("~2d left");
  });
});
