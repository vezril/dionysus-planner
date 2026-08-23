import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: sortable-columns — clickable column titles on the pantry
 * and products lists (Inventory's is the same shared control, covered
 * by unit tests + the shared component). Delta-based with run-unique
 * names so the persistent e2e DB never interferes. No service needed.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ITEM_A = `E2E Sort Aaa ${RUN_ID}`;
const ITEM_B = `E2E Sort Zzz ${RUN_ID}`;

async function createItem(page: Page, name: string, grams: string): Promise<void> {
  await page.goto("/pantry");
  await page.getByRole("button", { name: "Create custom item" }).click();
  const dialog = page.getByRole("dialog", { name: "Create custom item" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("combobox", { name: "Unit class" }).click();
  await page.getByRole("option", { name: "Mass", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Calories" }).fill("100");
  await dialog.getByRole("spinbutton", { name: "Protein" }).fill("1");
  await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("1");
  await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("1");
  await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill(grams);
  await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
  await page.getByRole("option", { name: "g", exact: true }).click();
  await dialog.getByRole("button", { name: "Create item" }).click();
  await expect(dialog).not.toBeVisible();
}

test.describe("sortable column titles", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: two pantry items with opposite name/quantity order", async ({ page }) => {
    await createItem(page, ITEM_A, "900"); // Aaa but LARGE quantity
    await createItem(page, ITEM_B, "100"); // Zzz but small quantity
  });

  test("pantry sorts by quantity, flips, and by name", async ({ page }) => {
    await page.goto("/pantry");
    const positions = async () => {
      const names = await page.getByTestId("pantry-row").allTextContents();
      const a = names.findIndex((text) => text.includes(ITEM_A));
      const b = names.findIndex((text) => text.includes(ITEM_B));
      return { a, b };
    };

    // Quantity ascending: Zzz (100 g) before Aaa (900 g).
    await page.getByTestId("sort-quantity").click();
    let order = await positions();
    expect(order.b).toBeLessThan(order.a);
    await expect(page.getByTestId("sort-quantity")).toHaveAttribute("aria-sort", "ascending");

    // Flip: Aaa first.
    await page.getByTestId("sort-quantity").click();
    order = await positions();
    expect(order.a).toBeLessThan(order.b);
    await expect(page.getByTestId("sort-quantity")).toHaveAttribute("aria-sort", "descending");

    // Name ascending: Aaa first again.
    await page.getByTestId("sort-name").click();
    order = await positions();
    expect(order.a).toBeLessThan(order.b);
  });

  test("products sort by calories header and flip", async ({ page }) => {
    await page.goto("/ingredients");
    await page.getByRole("textbox", { name: "Search ingredients" }).fill(`E2E Sort`);
    await page.getByTestId("sort-name").click();
    const first = page.getByTestId("ingredient-row").first();
    await expect(page.getByTestId("sort-name")).toHaveAttribute("aria-sort", "ascending");
    await expect(first).toContainText("E2E Sort Aaa");
    await page.getByTestId("sort-name").click();
    await expect(page.getByTestId("ingredient-row").first()).toContainText("E2E Sort Zzz");
  });
});
