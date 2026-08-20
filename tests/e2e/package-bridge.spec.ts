import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: count-via-package-size — "a can in a recipe" end to end: a
 * VOLUME custom item packaged as 355 mL, held as "1 each" in the pantry,
 * used as "1 each" in a recipe. The package size bridges COUNT↔VOLUME, so
 * the recipe gets nutrition (no "Unresolved — cannot compare units") and
 * what-can-I-cook counts the can as 355 mL.
 *
 * Test-isolation: uniquely-named fixtures; serial (later tests use the
 * item/recipe created earlier); functional ACs chromium-only per convention.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Create-custom-item dialog: "Package unit" is a combobox of known unit
 * keys (free text gone). Recipe detail (`/recipes/{id}`): a COUNT line on a
 * packaged VOLUME ingredient does NOT render "Unresolved — cannot compare
 * units", and nutrition totals are numbers. `/what-can-i-cook`: the recipe
 * is cookable from "1 each" pantry stock covering a 300 mL requirement.
 * ===========================================================================
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SODA_NAME = `E2E Pkg Fanta ${RUN_ID}`;
const RECIPE_NAME = `E2E Pkg Float ${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("count-via-package-size", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("a packaged VOLUME item held as 1 each is created via the dialog", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("textbox", { name: "Name" }).fill(SODA_NAME);
    await dialog.getByRole("spinbutton", { name: "Package size (optional)" }).fill("355");
    await dialog.getByRole("combobox", { name: "Package unit" }).click();
    await page.getByRole("option", { name: "mL", exact: true }).click();

    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("42");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("11");
    await dialog.getByRole("spinbutton", { name: "Fat" }).fill("0");

    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("1");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "each", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();

    await expect(page.getByTestId("pantry-row").filter({ hasText: SODA_NAME })).toBeVisible();
  });

  test("a '1 each' recipe line on the packaged item resolves — nutrition, no 'Unresolved'", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(RECIPE_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("1");

    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Pour ");
    await insertMention(page, SODA_NAME, "1", "each");
    await textarea.pressSequentially("over ice.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);

    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME }).getByRole("link").first().click();
    }

    await expect(page.getByText("Unresolved — cannot compare units")).toHaveCount(0);
    // 1 can = 355 mL over per-100 mL values: 42 kcal × 3.55 = 149.1 → "149 kcal".
    await expect(page.getByTestId("nutrition-total-calories")).toHaveText("149 kcal");
  });

  test("what-can-I-cook counts the 1-each stock as 355 mL (recipe cookable)", async ({ page }) => {
    await page.goto("/what-can-i-cook");
    const cookableSection = page.getByTestId("cookable-now-section");
    await expect(
      cookableSection.getByTestId("cookable-recipe-row").filter({ hasText: RECIPE_NAME }),
    ).toBeVisible();
  });
});
