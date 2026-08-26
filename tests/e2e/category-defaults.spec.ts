import { expect, test } from "@playwright/test";

/**
 * openspec: category-defaults — set defaults on a tree node, then a new
 * product with that category prefills its empty nutrition. No service
 * dependency; run-unique names.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const BROAD = `Rhum ${RUN_ID}`;
const STYLE = "Lightly Aged Pot Rhum";
const SEED_PRODUCT = `E2E CD Seed ${RUN_ID}`;
const NEW_PRODUCT = `E2E CD Bottle ${RUN_ID}`;

test.describe("category nutrition defaults", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: a product creates the category node", async ({ page }) => {
    await page.goto("/ingredients/new");
    await page.getByRole("textbox", { name: "Name" }).fill(SEED_PRODUCT);
    await page.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Calories" }).fill("231");
    await page.getByRole("spinbutton", { name: "Protein" }).fill("0");
    await page.getByRole("spinbutton", { name: "Carbs" }).fill("0");
    await page.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("0");
    await page.getByRole("textbox", { name: /Categories/ }).fill(`${BROAD}/${STYLE}`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/ingredients$/);
  });

  test("set defaults on the style node via the tree", async ({ page }) => {
    await page.goto("/ingredients");
    await page.getByRole("textbox", { name: "Search ingredients" }).fill("E2E CD Seed");
    await page.getByTestId("view-tree").click();
    const styleNode = page.getByTestId("category-node").filter({ hasText: STYLE }).last();
    await styleNode.getByTestId("category-defaults-toggle").last().click();
    const editor = page.getByTestId("category-defaults-editor");
    await editor.getByRole("spinbutton", { name: "Default kcal" }).fill("235");
    await editor.getByRole("spinbutton", { name: "Default % ABV" }).fill("40");
    await editor.getByTestId("category-defaults-save").click();
    await expect(page.getByTestId("category-defaults-chip").first()).toContainText("235 kcal");
  });

  test("a new product with that category prefills empty nutrition", async ({ page }) => {
    await page.goto("/ingredients/new");
    await page.getByRole("textbox", { name: "Name" }).fill(NEW_PRODUCT);
    await page.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await page.getByRole("combobox", { name: "Category" }).click();
    await page.getByRole("option", { name: "Drink", exact: true }).click();
    await page.getByRole("textbox", { name: /Categories/ }).fill(`${BROAD}/${STYLE}`);
    await page.getByRole("textbox", { name: /Categories/ }).blur();
    await expect(page.getByTestId("category-prefill-note")).toContainText(STYLE);
    await expect(page.getByRole("spinbutton", { name: "Calories" })).toHaveValue("235");
    await expect(page.getByRole("spinbutton", { name: "Alcohol (% ABV)" })).toHaveValue("40");
  });
});
