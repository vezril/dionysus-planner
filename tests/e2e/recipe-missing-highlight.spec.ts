import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: recipe-missing-highlight — the detail ingredient list badges
 * lines the pantry can't cover (missing / not enough), leaves covered
 * lines unbadged. No service dependency; run-unique names.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const STOCKED = `E2E MH Rice ${RUN_ID}`;
const SHORT = `E2E MH Beans ${RUN_ID}`;
const MISSING = `E2E MH Saffron ${RUN_ID}`;
const RECIPE_NAME = `E2E MH Paella ${RUN_ID}`;

async function createItem(page: Page, name: string, onHandGrams: string): Promise<void> {
  await page.goto("/pantry");
  await page.getByRole("button", { name: "Create custom item" }).click();
  const dialog = page.getByRole("dialog", { name: "Create custom item" });
  await dialog.getByRole("textbox", { name: "Name" }).fill(name);
  await dialog.getByRole("combobox", { name: "Unit class" }).click();
  await page.getByRole("option", { name: "Mass", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Calories" }).fill("100");
  await dialog.getByRole("spinbutton", { name: "Protein" }).fill("5");
  await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("10");
  await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("2");
  await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill(onHandGrams);
  await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
  await page.getByRole("option", { name: "g", exact: true }).click();
  await dialog.getByRole("button", { name: "Create item" }).click();
  await expect(dialog).not.toBeVisible();
}

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("recipe missing-ingredient highlight", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("only uncoverable lines are badged, each with the right severity", async ({ page }) => {
    await createItem(page, STOCKED, "500");
    await createItem(page, SHORT, "100");
    await createItem(page, MISSING, "0");

    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(RECIPE_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("4");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Simmer ");
    await insertMention(page, STOCKED, "300", "g");
    await textarea.pressSequentially("with ");
    await insertMention(page, SHORT, "300", "g");
    await textarea.pressSequentially("and ");
    await insertMention(page, MISSING, "50", "g");
    await textarea.pressSequentially("gently.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME }).getByRole("link").first().click();
    }

    const lineFor = (name: string) => page.getByTestId("recipe-line").filter({ hasText: name });
    await expect(lineFor(MISSING).getByTestId("recipe-line-missing")).toHaveText("missing from pantry");
    await expect(lineFor(SHORT).getByTestId("recipe-line-short")).toHaveText("not enough in pantry");
    await expect(lineFor(STOCKED).getByTestId("recipe-line-missing")).toHaveCount(0);
    await expect(lineFor(STOCKED).getByTestId("recipe-line-short")).toHaveCount(0);
  });
});
