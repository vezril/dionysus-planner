import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: weekly-planner — plan entries round-trip, suggestions deplete
 * by the planned week, expiring pantry items flag their recipes.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const JUICE_NAME = `E2E Plan Juice ${RUN_ID}`;
const RECIPE_NAME = `E2E Plan Smoothie ${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("weekly planner", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: an expiring pantry item and a recipe that uses it", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(JUICE_NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("47");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("0.7");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("10.8");
    await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("0.2");
    await dialog.getByRole("spinbutton", { name: "Shelf life (days)" }).fill("2");
    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("400");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "mL", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();

    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(RECIPE_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("1");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Blend ");
    await insertMention(page, JUICE_NAME, "300", "mL");
    await textarea.pressSequentially("and serve cold.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
  });

  test("suggestions flag the expiring recipe as cookable; planning it depletes the headroom", async ({ page }) => {
    await page.goto("/planner");
    const cookable = page.getByTestId("planner-suggestions-cookable");
    const suggestion = cookable.getByTestId("planner-suggestion").filter({ hasText: RECIPE_NAME });
    await expect(suggestion).toBeVisible();
    await expect(suggestion.getByTestId("uses-expiring")).toBeVisible();

    // Plan it once (300 of 400 mL) — it stops being cookable for the week.
    await page.getByRole("combobox", { name: "Plan recipe" }).click();
    await page.getByRole("option", { name: RECIPE_NAME }).click();
    await page.getByTestId("plan-add").click();

    const entry = page.getByTestId("plan-entry").filter({ hasText: RECIPE_NAME });
    await expect(entry).toBeVisible();
    await expect(cookable.getByTestId("planner-suggestion").filter({ hasText: RECIPE_NAME })).toHaveCount(0);
    await expect(
      page.getByTestId("planner-suggestions-near").getByTestId("planner-suggestion").filter({ hasText: RECIPE_NAME }),
    ).toBeVisible();
  });

  test("planning past the pantry fills the shopping list", async ({ page }) => {
    await page.goto("/planner");
    // First entry (300 of 400 mL) is covered — nothing to buy yet.
    await expect(page.getByTestId("shopping-list-empty")).toBeVisible();

    // Second smoothie: 600 needed vs 400 held → buy 200 mL.
    await page.getByRole("combobox", { name: "Plan recipe" }).click();
    await page.getByRole("option", { name: RECIPE_NAME }).click();
    await page.getByTestId("plan-add").click();

    const item = page.getByTestId("shopping-list-item").filter({ hasText: JUICE_NAME });
    await expect(item).toContainText("200 mL");
    await expect(page.getByTestId("shopping-list-copy")).toBeVisible();

    // Clean up the second entry so the removal test below sees one entry.
    await page
      .getByTestId("plan-entry")
      .filter({ hasText: RECIPE_NAME })
      .last()
      .getByRole("button", { name: `Remove ${RECIPE_NAME}` })
      .click();
    await expect(page.getByTestId("plan-entry").filter({ hasText: RECIPE_NAME })).toHaveCount(1);
  });

  test("removing the entry restores the suggestion and empties the day", async ({ page }) => {
    await page.goto("/planner");
    const entry = page.getByTestId("plan-entry").filter({ hasText: RECIPE_NAME });
    await entry.getByRole("button", { name: `Remove ${RECIPE_NAME}` }).click();
    await expect(page.getByTestId("plan-entry").filter({ hasText: RECIPE_NAME })).toHaveCount(0);
    await expect(
      page.getByTestId("planner-suggestions-cookable").getByTestId("planner-suggestion").filter({ hasText: RECIPE_NAME }),
    ).toBeVisible();
  });
});
