import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: ratings-variants-links — star ratings on the recipe detail
 * page, duplicate-as-linked-variation, and merchant links round-tripping
 * on the product form. No service dependency; run-unique names.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const FLOUR_NAME = `E2E RVL Flour ${RUN_ID}`;
const RECIPE_NAME = `E2E RVL Bread ${RUN_ID}`;
const LINK_A = `https://storea.example/flour-${RUN_ID}`;
const LINK_B = `https://storeb.example/flour-${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("ratings, variations, merchant links", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("merchant links save and round-trip on the product form", async ({ page }) => {
    await page.goto("/ingredients/new");
    await page.getByRole("textbox", { name: "Name" }).fill(FLOUR_NAME);
    await page.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Mass", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Calories" }).fill("364");
    await page.getByRole("spinbutton", { name: "Protein" }).fill("10");
    await page.getByRole("spinbutton", { name: "Carbs" }).fill("76");
    await page.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("1");
    await page.getByRole("textbox", { name: /Merchant links/ }).fill(`${LINK_A}\n${LINK_B}`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/ingredients$/);

    await page.getByRole("textbox", { name: "Search ingredients" }).fill(FLOUR_NAME);
    const row = page.getByTestId("ingredient-row").filter({ hasText: FLOUR_NAME });
    await expect(row).toBeVisible();
    await row.getByRole("link").first().click();
    await expect(page.getByRole("textbox", { name: /Merchant links/ })).toHaveValue(`${LINK_A}\n${LINK_B}`);
  });

  test("a recipe rates 1–5, persists, and clears on re-click", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(RECIPE_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("4");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Bake ");
    await insertMention(page, FLOUR_NAME, "500", "g");
    await textarea.pressSequentially("well.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME }).getByRole("link").first().click();
    }

    await page.getByTestId("rate-star-4").click();
    await expect(page.getByTestId("rate-star-4")).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByTestId("rate-star-4")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("rate-star-5")).toHaveAttribute("aria-pressed", "false");

    // The list row shows the stars.
    await page.goto("/recipes");
    await page.getByRole("textbox", { name: "Search recipes" }).fill(RECIPE_NAME);
    const row = page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME });
    await expect(row.getByTestId("recipe-row-rating")).toHaveText("★★★★");

    // Clicking the current rating clears it.
    await row.getByRole("link").first().click();
    await page.getByTestId("rate-star-4").click();
    await expect(page.getByTestId("rate-star-4")).toHaveAttribute("aria-pressed", "false");
  });

  test("create variation duplicates the recipe linked to its root", async ({ page }) => {
    await page.goto("/recipes");
    await page.getByRole("textbox", { name: "Search recipes" }).fill(RECIPE_NAME);
    await page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME }).getByRole("link").first().click();

    await page.getByTestId("create-variation").click();
    await expect(page).toHaveURL(/\/recipes\/\d+\/edit$/);
    await expect(page.getByRole("textbox", { name: "Recipe name" })).toHaveValue(`${RECIPE_NAME} (variation)`);

    // The variation's detail links back to the root; the root lists it.
    await page.goto("/recipes");
    await page.getByRole("textbox", { name: "Search recipes" }).fill(`${RECIPE_NAME} (variation)`);
    const variantRow = page.getByTestId("recipe-row").filter({ hasText: `${RECIPE_NAME} (variation)` });
    await expect(variantRow.getByTestId("recipe-row-variant")).toHaveText(`variation of ${RECIPE_NAME}`);
    await variantRow.getByRole("link").first().click();
    await expect(page.getByTestId("variant-of")).toContainText(RECIPE_NAME);
    await page.getByTestId("variant-of").getByRole("link").click();
    await expect(page.getByTestId("variations")).toContainText(`${RECIPE_NAME} (variation)`);
  });
});
