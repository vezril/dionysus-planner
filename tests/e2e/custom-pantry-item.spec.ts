import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: custom-pantry-items — one-step branded-product creation from
 * /pantry, product identity (barcode uniqueness), zero-quantity
 * persistence (out-of-stock), and the detail page's product panel.
 *
 * Test-isolation: uniquely-named/barcoded fixtures; serial (later tests
 * build on earlier state); functional ACs chromium-only per convention.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * `/pantry` (populated or empty state): button "Create custom item" opens
 * a dialog "Create custom item" with: textbox Name, Brand (optional),
 * Barcode (optional), spinbutton Package size (optional), combobox Package
 * unit (known unit keys — count-via-package-size), combobox "Unit class", nutrition spinbuttons (Calories/Protein/
 * Carbs/Fat required), spinbutton "On hand now (0 is fine)", combobox
 * "Pantry unit", submit "Create item".
 * A duplicate barcode surfaces `data-testid="field-error-barcode"`.
 * Zero-quantity rows show `data-testid="out-of-stock"` instead of the
 * quantity; editing an existing row to 0 persists it with the same badge;
 * restocking clears the badge. `/pantry/{id}` shows
 * `data-testid="product-panel"` (brand/barcode/package) only for items
 * with product identity.
 * ===========================================================================
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ITEM_NAME = `E2E Ritz crackers ${RUN_ID}`;
const ZERO_ITEM_NAME = `E2E Empty Box ${RUN_ID}`;
const BARCODE = `E2E-${RUN_ID}`;

async function openCreateDialog(page: Page) {
  await page.goto("/pantry");
  await page.getByRole("button", { name: "Create custom item" }).click();
  const dialog = page.getByRole("dialog", { name: "Create custom item" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillRequired(page: Page, dialog: ReturnType<Page["getByTestId"]>, name: string) {
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("combobox", { name: "Unit class" }).click();
  await page.getByRole("option", { name: "Mass", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Calories" }).fill("492");
  await dialog.getByRole("spinbutton", { name: "Protein" }).fill("7");
  await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("61");
  await dialog.getByRole("spinbutton", { name: "Fat" }).fill("24");
}

async function fillPantryHalf(page: Page, dialog: ReturnType<Page["getByTestId"]>, quantity: string) {
  await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill(quantity);
  await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
  await page.getByRole("option", { name: "g", exact: true }).click();
}

function rowFor(page: Page, name: string) {
  return page.getByTestId("pantry-row").filter({ hasText: name });
}

test.describe("custom pantry items", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("creates a branded item with barcode + package size from the pantry page", async ({ page }) => {
    const dialog = await openCreateDialog(page);
    await fillRequired(page, dialog, ITEM_NAME);
    await dialog.getByRole("textbox", { name: "Brand (optional)" }).fill("Ritz");
    await dialog.getByRole("textbox", { name: "Barcode (optional)" }).fill(BARCODE);
    await dialog.getByRole("spinbutton", { name: "Package size (optional)" }).fill("200");
    // openspec: count-via-package-size — package unit is a select now.
    await dialog.getByRole("combobox", { name: "Package unit" }).click();
    await page.getByRole("option", { name: "g", exact: true }).click();
    await fillPantryHalf(page, dialog, "200");
    await dialog.getByRole("button", { name: "Create item" }).click();

    await expect(dialog).not.toBeVisible();
    await expect(rowFor(page, ITEM_NAME)).toBeVisible();
    await expect(rowFor(page, ITEM_NAME)).toContainText("200 g");
  });

  test("the detail page shows the product panel for the branded item", async ({ page }) => {
    await page.goto("/pantry");
    await rowFor(page, ITEM_NAME).getByRole("link", { name: ITEM_NAME }).click();

    const panel = page.getByTestId("product-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("product-brand")).toContainText("Ritz");
    await expect(panel.getByTestId("product-barcode")).toContainText(BARCODE);
    await expect(panel.getByTestId("product-package")).toContainText("200 g");
  });

  test("a duplicate barcode is rejected with a field error and creates nothing", async ({ page }) => {
    const dialog = await openCreateDialog(page);
    await fillRequired(page, dialog, `${ITEM_NAME} clone`);
    await dialog.getByRole("textbox", { name: "Barcode (optional)" }).fill(BARCODE);
    await fillPantryHalf(page, dialog, "100");
    await dialog.getByRole("button", { name: "Create item" }).click();

    await expect(dialog.getByTestId("field-error-barcode")).toContainText(/already exists/i);
    await page.keyboard.press("Escape");
    await expect(rowFor(page, `${ITEM_NAME} clone`)).toHaveCount(0);
  });

  test("a custom item created with zero quantity is listed as out of stock", async ({ page }) => {
    const dialog = await openCreateDialog(page);
    await fillRequired(page, dialog, ZERO_ITEM_NAME);
    await fillPantryHalf(page, dialog, "0");
    await dialog.getByRole("button", { name: "Create item" }).click();

    await expect(dialog).not.toBeVisible();
    const row = rowFor(page, ZERO_ITEM_NAME);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("out-of-stock")).toBeVisible();
  });

  test("editing an in-stock item down to zero keeps the row, out of stock", async ({ page }) => {
    await page.goto("/pantry");
    const row = rowFor(page, ITEM_NAME);
    await row.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Quantity").fill("0");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();

    await expect(row).toBeVisible();
    await expect(row.getByTestId("out-of-stock")).toBeVisible();
    // Detail page still opens for a zero row.
    await row.getByRole("link", { name: ITEM_NAME }).click();
    await expect(page.getByRole("heading", { level: 1, name: ITEM_NAME })).toBeVisible();
  });

  test("restocking a zero row clears the out-of-stock badge", async ({ page }) => {
    await page.goto("/pantry");
    const row = rowFor(page, ITEM_NAME);
    await row.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Quantity").fill("350");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).not.toBeVisible();

    await expect(row.getByTestId("out-of-stock")).toHaveCount(0);
    await expect(row).toContainText("350 g");
  });
});
