import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: planner-ready-to-eat — batches in the planner, gated on a live
 * service exactly like cook-recipe.spec.ts (inert without
 * DIONYSUS_SERVICE_URL; runs in the e2e-meal-log CI job).
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SODA_NAME = `E2E RTE Soda ${RUN_ID}`;
const RECIPE_NAME = `E2E RTE Stew ${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("planner ready-to-eat", () => {
  test.skip(!process.env.DIONYSUS_SERVICE_URL, "requires a live DIONYSUS_SERVICE_URL");
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: cook a 40-portion batch (eating 0 now)", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(SODA_NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("50");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("1");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("10");
    await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("1");
    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("2000");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "mL", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();

    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(RECIPE_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("40");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Simmer ");
    await insertMention(page, SODA_NAME, "800", "mL");
    await textarea.pressSequentially("until thick.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME }).getByRole("link").first().click();
    }

    await page.getByTestId("cook-recipe").click();
    const cookDialog = page.getByRole("dialog", { name: /cook/i });
    await cookDialog.getByRole("spinbutton", { name: "Eating now" }).fill("0");
    await cookDialog.getByTestId("cook-confirm").click();
    await expect(cookDialog.getByTestId("cook-result")).toBeVisible();
  });

  test("the batch appears as ready to eat, plans onto a day, and availability shrinks", async ({ page }) => {
    await page.goto("/planner");
    const ready = page.getByTestId("planner-ready-batch").filter({ hasText: RECIPE_NAME });
    // Delta-based AND oversized (40 portions): a persistent local planner
    // DB can hold stale batch plans against a recreated service container's
    // reused ids — the pool must stay positive despite them.
    await expect(ready).toBeVisible();
    const before = Number((await ready.textContent())!.match(/(\d+(?:\.\d+)?) portions available/)![1]);

    await page.getByRole("combobox", { name: "Plan recipe" }).click();
    await page.getByRole("option", { name: new RegExp(`${RECIPE_NAME} — ready to eat`) }).click();
    await page.getByLabel("Portions").fill("3");
    await page.getByTestId("plan-add").click();

    const entry = page.getByTestId("plan-entry").filter({ hasText: RECIPE_NAME }).filter({ has: page.getByTestId("plan-entry-batch") });
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("3 portions");
    await expect(page.getByTestId("planner-ready-batch").filter({ hasText: RECIPE_NAME })).toContainText(
      `${before - 3} portions available`,
    );
    // Batch plans never touch the shopping list.
    await expect(page.getByTestId("shopping-list-empty")).toBeVisible();

    // Self-clean so reruns against a persistent planner DB stay bounded.
    await entry.getByRole("button", { name: /Remove/ }).click();
    await expect(
      page.getByTestId("plan-entry").filter({ hasText: RECIPE_NAME }).filter({ has: page.getByTestId("plan-entry-batch") }),
    ).toHaveCount(0);
  });
});
