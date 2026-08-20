import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: pantry-quick-eat — eat a can straight from the pantry
 * end-to-end (service meal + pantry decrement + today's planner entry),
 * gated on a live service exactly like cook-recipe.spec.ts (inert
 * without DIONYSUS_SERVICE_URL; runs in the e2e-meal-log CI job).
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const BEER_NAME = `E2E Quick Beer ${RUN_ID}`;
const BREW_RECIPE = `E2E Quick Brew ${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

async function cookEatingNothing(page: Page): Promise<void> {
  await page.getByTestId("cook-recipe").click();
  const cookDialog = page.getByRole("dialog", { name: /cook/i });
  await cookDialog.getByRole("spinbutton", { name: "Eating now" }).fill("0");
  await cookDialog.getByTestId("cook-confirm").click();
  await expect(cookDialog.getByTestId("cook-result")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
}

test.describe("pantry quick eat", () => {
  test.skip(!process.env.DIONYSUS_SERVICE_URL, "requires a live DIONYSUS_SERVICE_URL");
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: a ready-to-eat 355 mL canned drink, two cans stocked", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(BEER_NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("43");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("3");
    await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("0");
    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("710");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "mL", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Package size (optional)" }).fill("355");
    await dialog.getByRole("combobox", { name: "Package unit" }).click();
    await page.getByRole("option", { name: "mL", exact: true }).click();
    await dialog.getByRole("checkbox", { name: "Ready to consume" }).check();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByTestId("pantry-row").filter({ hasText: BEER_NAME })).toBeVisible();
  });

  test("eating one can decrements the pantry and plans today's entry", async ({ page }) => {
    await page.goto("/pantry");
    const row = page.getByTestId("pantry-row").filter({ hasText: BEER_NAME });
    await expect(row).toContainText("710");

    // Prefilled with the package size (355 mL) — confirm as-is.
    await row.getByTestId("eat-item").click();
    const dialog = page.getByRole("dialog", { name: `Eat ${BEER_NAME}` });
    await expect(dialog.getByRole("spinbutton", { name: /Quantity/ })).toHaveValue("355");
    await dialog.getByTestId("eat-confirm").click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByTestId("pantry-row").filter({ hasText: BEER_NAME })).toContainText("355");

    // The eaten can lands on today's planner day automatically.
    await page.goto("/planner");
    const entry = page.getByTestId("plan-entry").filter({ hasText: BEER_NAME });
    await expect(entry).toBeVisible();
    await expect(entry.getByTestId("plan-entry-eaten")).toBeVisible();
  });

  test("two batches of one recipe merge into a single Inventory row", async ({ page }) => {
    // A 2-serving recipe over the remaining beer, cooked twice.
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(BREW_RECIPE);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("2");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Pour ");
    await insertMention(page, BEER_NAME, "100", "mL");
    await textarea.pressSequentially("and chill.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: BREW_RECIPE }).getByRole("link").first().click();
    }

    await cookEatingNothing(page);
    await page.reload();
    await cookEatingNothing(page);

    // One merged row with the summed portions — not a row per batch.
    await page.goto("/meal-log");
    const rows = page.getByTestId("ready-to-consume-row").filter({ hasText: BREW_RECIPE });
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("4 portions");
  });
});
