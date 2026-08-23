import { expect, test } from "@playwright/test";

/**
 * openspec: plan-pantry-backdate — plan a ready-to-eat pantry product
 * onto a day from the planner picker, and the Eat/Drink dialog offers
 * a "Log to day" date. No service dependency; run-unique names.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SNACK_NAME = `E2E PP Chips ${RUN_ID}`;

test.describe("plan pantry items + backdate control", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: a stocked ready-to-consume snack", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(SNACK_NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Mass", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("520");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("6");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("52");
    await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("32");
    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("200");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "g", exact: true }).click();
    await dialog.getByRole("checkbox", { name: "Ready to consume" }).check();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("the planner picker plans it onto a day without touching the pantry", async ({ page }) => {
    await page.goto("/planner");
    await page.getByRole("combobox", { name: "Plan recipe" }).click();
    await page.getByRole("option", { name: new RegExp(`${SNACK_NAME} — from pantry`) }).click();
    await page.getByLabel("Portions").fill("1");
    await page.getByTestId("plan-add").click();

    const entry = page
      .getByTestId("plan-entry")
      .filter({ hasText: SNACK_NAME })
      .filter({ has: page.getByTestId("plan-entry-pantry") });
    await expect(entry).toBeVisible();
    await expect(entry.getByTestId("plan-entry-pantry")).toHaveText("(from pantry)");

    // Planning consumes nothing.
    await page.goto("/pantry");
    await expect(page.getByTestId("pantry-row").filter({ hasText: SNACK_NAME })).toContainText("200 g");

    // Self-clean the entry for rerun stability.
    await page.goto("/planner");
    await entry.getByRole("button", { name: /Remove/ }).click();
    await expect(
      page.getByTestId("plan-entry").filter({ hasText: SNACK_NAME }),
    ).toHaveCount(0);
  });

  test("the Eat dialog offers a Log-to-day date capped at today", async ({ page }) => {
    await page.goto("/pantry");
    const row = page.getByTestId("pantry-row").filter({ hasText: SNACK_NAME });
    await row.getByTestId("eat-item").click();
    const dateInput = page.getByLabel("Log to day");
    await expect(dateInput).toBeVisible();
    const today = new Date().toLocaleDateString("en-CA");
    await expect(dateInput).toHaveValue(today);
    await expect(dateInput).toHaveAttribute("max", today);
  });
});
