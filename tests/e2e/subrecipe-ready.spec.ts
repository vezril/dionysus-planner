import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: subrecipe-ready — cook the sub-recipe, then the parent's
 * [[link]] shows its remaining portions. Service-gated like the other
 * cook-flow specs (inert without DIONYSUS_SERVICE_URL; runs in the
 * e2e-meal-log CI job).
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SPICE_NAME = `E2E RD Paprika ${RUN_ID}`;
const MIX_NAME = `E2E RD Spice Mix ${RUN_ID}`;
const PARENT_NAME = `E2E RD Chicken ${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("sub-recipe ready badge", () => {
  test.skip(!process.env.DIONYSUS_SERVICE_URL, "requires a live DIONYSUS_SERVICE_URL");
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: spice, sub-recipe cooked to 4 portions, parent referencing it", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(SPICE_NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Mass", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("280");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("14");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("54");
    await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("13");
    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("500");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "g", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();

    // Sub-recipe, cooked at its 4 servings eating none.
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(MIX_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("4");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Blend ");
    await insertMention(page, SPICE_NAME, "40", "g");
    await textarea.pressSequentially("thoroughly.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByRole("textbox", { name: "Search recipes" }).fill(MIX_NAME);
      await page.getByTestId("recipe-row").filter({ hasText: MIX_NAME }).getByRole("link").first().click();
    }
    await page.getByTestId("cook-recipe").click();
    const cookDialog = page.getByRole("dialog", { name: /cook/i });
    await cookDialog.getByRole("spinbutton", { name: "Eating now" }).fill("0");
    await cookDialog.getByTestId("cook-confirm").click();
    await expect(cookDialog.getByTestId("cook-result")).toBeVisible();
  });

  test("the parent's [[link]] shows the ready portions", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(PARENT_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("2");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Season with ");
    await insertMention(page, SPICE_NAME, "5", "g");
    await textarea.pressSequentially(`using [[${MIX_NAME.slice(0, 14)}`);
    const option = page.getByTestId("recipe-ref-option").filter({ hasText: MIX_NAME });
    await expect(option.first()).toBeVisible();
    await option.first().click();
    await textarea.pressSequentially(" generously.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByRole("textbox", { name: "Search recipes" }).fill(PARENT_NAME);
      await page.getByTestId("recipe-row").filter({ hasText: PARENT_NAME }).getByRole("link").first().click();
    }

    await expect(page.getByTestId("subrecipe-link")).toHaveText(MIX_NAME);
    await expect(page.getByTestId("subrecipe-ready")).toHaveText("4 portions ready");
  });
});
