import { expect, test } from "@playwright/test";

/**
 * openspec: nutrition-basis-and-edit — enter label-basis nutrition ("per
 * 355 mL can") and the app stores/shows per-reference values; edit any
 * item's details from its pantry detail page.
 *
 * Test-isolation: uniquely-named/barcoded fixtures; serial (the edit test
 * builds on the created item); functional ACs chromium-only per convention.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Create-custom-item dialog: spinbutton "Values are per" + combobox "Basis
 * unit" (options constrained to the chosen unit class, defaulting to the
 * class reference — 100 mL for Volume). Entering per-355 mL values stores
 * per-100 mL: detail page nutrition facts show the scaled numbers.
 * `/pantry/{id}`: link "Edit details" → `/ingredients/{ingredientId}/edit`
 * (the full ingredient form, prefilled); saving a barcode there shows on
 * the detail page's product panel.
 * ===========================================================================
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SODA_NAME = `E2E Cola Can ${RUN_ID}`;
const BARCODE = `E2E-BASIS-${RUN_ID}`;

test.describe("nutrition basis + edit details", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("per-355 mL label values are stored per 100 mL", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("textbox", { name: "Name" }).fill(SODA_NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();

    // Choosing Volume defaults the basis to the class reference (100 mL).
    await expect(dialog.getByRole("spinbutton", { name: "Values are per" })).toHaveValue("100");
    await expect(dialog.getByRole("combobox", { name: "Basis unit" })).toContainText("mL");

    // Enter the label's per-can values instead.
    await dialog.getByRole("spinbutton", { name: "Values are per" }).fill("355");
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("150");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("39");
    await dialog.getByRole("spinbutton", { name: "Fat" }).fill("0");

    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("355");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "mL", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();

    // Detail page shows per-100 mL values (150 × 100/355 = 42.2535 ...).
    const row = page.getByTestId("pantry-row").filter({ hasText: SODA_NAME });
    await row.getByRole("link", { name: SODA_NAME }).click();
    const facts = page.getByTestId("nutrition-facts");
    await expect(facts.getByTestId("nutrition-calories")).toContainText("42.2535 kcal");
    await expect(facts.getByTestId("nutrition-carbs")).toContainText("10.9859 g");
  });

  test("Edit details round-trips: fixing a barcode shows on the product panel", async ({ page }) => {
    await page.goto("/pantry");
    const row = page.getByTestId("pantry-row").filter({ hasText: SODA_NAME });
    await row.getByRole("link", { name: SODA_NAME }).click();

    const editLink = page.getByRole("link", { name: "Edit details" });
    await expect(editLink).toBeVisible();
    await editLink.click();
    await expect(page).toHaveURL(/\/ingredients\/\d+\/edit$/);

    // Prefilled with the item's current values.
    await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(SODA_NAME);

    await page.getByRole("textbox", { name: "Barcode (optional)" }).fill(BARCODE);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/ingredients$/);

    await page.goto("/pantry");
    await row.getByRole("link", { name: SODA_NAME }).click();
    await expect(page.getByTestId("product-panel").getByTestId("product-barcode")).toContainText(BARCODE);
  });
});
