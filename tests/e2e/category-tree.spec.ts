import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: category-tree — the user's Rhum taxonomy end to end: path
 * categories nest in the products "By category" view, and search prunes
 * to matching branches. No service dependency; run-unique names.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const BROAD = `Rhum ${RUN_ID}`;
const STYLE_A = "Lightly Aged Pot Rhum";
const STYLE_B = "Another style of rhum";
const PRODUCT_1 = `E2E CT Product1 ${RUN_ID}`;
const PRODUCT_2 = `E2E CT Product2 ${RUN_ID}`;
const PRODUCT_3 = `E2E CT Product3 ${RUN_ID}`;

async function createProduct(page: Page, name: string, categories: string): Promise<void> {
  await page.goto("/ingredients/new");
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByRole("combobox", { name: "Unit class" }).click();
  await page.getByRole("option", { name: "Volume", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Calories" }).fill("231");
  await page.getByRole("spinbutton", { name: "Protein" }).fill("0");
  await page.getByRole("spinbutton", { name: "Carbs" }).fill("0");
  await page.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("0");
  await page.getByRole("textbox", { name: /Categories/ }).fill(categories);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/ingredients$/);
}

test.describe("category tree", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: three rhums across two styles", async ({ page }) => {
    await createProduct(page, PRODUCT_1, `${BROAD}/${STYLE_A}`);
    await createProduct(page, PRODUCT_2, `${BROAD}/${STYLE_A}`);
    await createProduct(page, PRODUCT_3, `${BROAD}/${STYLE_B}`);
  });

  test("the By-category view nests styles under the broad category", async ({ page }) => {
    await page.goto("/ingredients");
    await page.getByRole("textbox", { name: "Search ingredients" }).fill(`E2E CT`);
    await page.getByTestId("view-tree").click();

    const broad = page.getByTestId("category-node").filter({ hasText: BROAD }).first();
    await expect(broad).toBeVisible();
    const styleA = broad.getByTestId("category-node").filter({ hasText: STYLE_A });
    await expect(styleA.getByTestId("category-product").filter({ hasText: PRODUCT_1 })).toBeVisible();
    await expect(styleA.getByTestId("category-product").filter({ hasText: PRODUCT_2 })).toBeVisible();
    const styleB = broad.getByTestId("category-node").filter({ hasText: STYLE_B });
    await expect(styleB.getByTestId("category-product").filter({ hasText: PRODUCT_3 })).toBeVisible();

    // Search prunes: only product 3's branch survives.
    await page.getByRole("textbox", { name: "Search ingredients" }).fill(PRODUCT_3);
    await expect(page.getByTestId("category-product")).toHaveCount(1);
    await expect(page.getByTestId("category-node").filter({ hasText: STYLE_B }).first()).toBeVisible();
  });
});
