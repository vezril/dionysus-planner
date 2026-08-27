import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: pack-units — a 366 g box of 61 g packs: recipes take
 * {1%pack}, the pantry Adjust menu drops one pack. Planner-local (no
 * service needed); functional ACs verified once on chromium.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const OATMEAL_NAME = `E2E Pack Oatmeal ${RUN_ID}`;
const RECIPE_NAME = `E2E Pack Oats ${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("pack units", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: a boxed product with a 61 g inner pack", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(OATMEAL_NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Mass", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("380");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("13");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("68");
    await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("6");
    await dialog.getByRole("spinbutton", { name: "Package size (optional)" }).fill("366");
    await dialog.getByRole("combobox", { name: "Package unit" }).click();
    await page.getByRole("option", { name: "g", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Pack size (optional)" }).fill("61");
    await dialog.getByRole("combobox", { name: "Pack unit" }).click();
    await page.getByRole("option", { name: "g", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("366");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "g", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("Adjust drops exactly one pack from the box", async ({ page }) => {
    await page.goto("/pantry");
    const row = page.getByTestId("pantry-row").filter({ hasText: OATMEAL_NAME });
    await expect(row).toContainText("366");
    await row.getByTestId("adjust-quantity").click();
    await row.getByTestId("adjust-pack").click();
    await expect(row).toContainText("305");
  });

  test("a recipe measured in packs saves and displays as packs", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(RECIPE_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("1");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Soak ");
    await insertMention(page, OATMEAL_NAME, "1", "pack");
    await textarea.pressSequentially("overnight.");

    // The live preview already prices the pack (380 kcal/100 g × 61 g ≈ 232).
    await expect(page.getByTestId("recipe-nutrition-preview")).toContainText("232 kcal");

    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByRole("textbox", { name: "Search recipes" }).fill(RECIPE_NAME);
      await page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME }).getByRole("link").first().click();
    }

    const line = page.getByTestId("recipe-line").filter({ hasText: OATMEAL_NAME });
    await expect(line.getByTestId("recipe-line-quantity")).toContainText("1 pack");
    await expect(page.getByTestId("nutrition-total-calories")).toContainText("232 kcal");
  });
});
