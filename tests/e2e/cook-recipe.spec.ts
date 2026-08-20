import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: cook-recipe-into-meals — cook a recipe at the slider's portion
 * count into a service batch, consuming pantry stock. Gated exactly like
 * meal-log-flow.spec.ts: inert without a live DIONYSUS_SERVICE_URL (the
 * required e2e job never sets it; the e2e-meal-log job runs it against the
 * real :dev service image).
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * `/recipes/{id}`: button `data-testid="cook-recipe"` (name "Cook N
 * portion(s)", N = slider value) → dialog (name /cook/i) listing
 * `data-testid="cook-line"` rows with status markers
 * (`cook-line-status-ok|insufficient|missing|unresolved`); missing/
 * unresolved rows offer Ignore/Substitute radios (Ignore preselected);
 * `data-testid="cook-confirm"` runs the cook; success panel
 * `data-testid="cook-result"` links to /meal-log/batches. Pantry stock is
 * decremented; a batch for the mirrored recipe appears in Meals › Batches.
 * ===========================================================================
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SODA_NAME = `E2E Cook Soda ${RUN_ID}`;
const RECIPE_NAME = `E2E Cook Recipe ${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("cook recipe into meals", () => {
  test.skip(!process.env.DIONYSUS_SERVICE_URL, "requires a live DIONYSUS_SERVICE_URL");
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: a VOLUME pantry item with 400 mL on hand", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(SODA_NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("42");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("11");
    await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("0");
    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("400");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "mL", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("cooking consumes the pantry and logs a batch", async ({ page }) => {
    // 1-serving recipe using 300 mL of the soda.
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(RECIPE_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("1");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Pour ");
    await insertMention(page, SODA_NAME, "300", "mL");
    await textarea.pressSequentially("and enjoy.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME }).getByRole("link").first().click();
    }

    await page.getByTestId("cook-recipe").click();
    const dialog = page.getByRole("dialog", { name: /cook/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("cook-line").filter({ hasText: SODA_NAME })).toBeVisible();
    await expect(dialog.getByTestId("cook-line-status-ok")).toBeVisible();

    // openspec: eat-now-and-quick-log — defaults to eating 1 now.
    await expect(dialog.getByRole("spinbutton", { name: "Eating now" })).toHaveValue("1");
    await dialog.getByTestId("cook-confirm").click();
    await expect(dialog.getByTestId("cook-result")).toBeVisible();
    await expect(dialog.getByTestId("cook-result")).toContainText("pantry updated");
    await expect(dialog.getByTestId("cook-eaten-now")).toContainText("1 logged as eaten now");

    // Pantry decremented 400 → 100 mL.
    await page.goto("/pantry");
    await expect(page.getByTestId("pantry-row").filter({ hasText: SODA_NAME })).toContainText("100 mL");

    // Batch visible under Meals › Batches; 1 of 1 portions eaten now → 0 remaining.
    await page.goto("/meal-log/batches");
    const batchRow = page.getByTestId("meal-log-batch-row").filter({ hasText: RECIPE_NAME });
    await expect(batchRow).toContainText("0 portions remaining");
    // Exhausted batch offers no quick-log control.
    await expect(batchRow.getByTestId("log-portion")).toHaveCount(0);

    // The eaten portion shows on today's Meals view.
    await page.goto("/meal-log");
    await expect(page.getByTestId("day-log-meals")).toBeVisible();
  });

  test("quick-log decrements a batch with remaining portions", async ({ page }) => {
    // The missing-recipe cook (next test's fixture order) hasn't run yet, so
    // cook a fresh 2-portion batch eating 0 now, then quick-log one.
    const leftoverRecipe = `E2E Leftovers ${RUN_ID}`;
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(leftoverRecipe);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("2");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Pour ");
    await insertMention(page, SODA_NAME, "20", "mL");
    await textarea.pressSequentially("done.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: leftoverRecipe }).getByRole("link").first().click();
    }

    await page.getByTestId("cook-recipe").click();
    const dialog = page.getByRole("dialog", { name: /cook/i });
    await dialog.getByRole("spinbutton", { name: "Eating now" }).fill("0");
    await dialog.getByTestId("cook-confirm").click();
    await expect(dialog.getByTestId("cook-result")).toBeVisible();

    await page.goto("/meal-log/batches");
    const row = page.getByTestId("meal-log-batch-row").filter({ hasText: leftoverRecipe });
    await expect(row).toContainText("2 portions remaining");
    await row.getByTestId("log-portion").click();
    await expect(row).toContainText("1 portions remaining");
  });

  test("a missing ingredient defaults to Ignore and cooking still succeeds", async ({ page }) => {
    const missingRecipe = `E2E Cook Missing ${RUN_ID}`;
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(missingRecipe);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("1");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Mix ");
    await insertMention(page, SODA_NAME, "50", "mL");
    // Seeded ingredient that is not in the pantry:
    await insertMention(page, "Garlic powder", "5", "g");
    await textarea.pressSequentially("done.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: missingRecipe }).getByRole("link").first().click();
    }

    await page.getByTestId("cook-recipe").click();
    const dialog = page.getByRole("dialog", { name: /cook/i });
    await expect(dialog.getByTestId("cook-line-status-missing")).toBeVisible();
    const missingLine = dialog.getByTestId("cook-line").filter({ hasText: "Garlic powder" });
    await expect(missingLine.getByRole("radio", { name: "Ignore" })).toBeChecked();

    await dialog.getByTestId("cook-confirm").click();
    await expect(dialog.getByTestId("cook-result")).toBeVisible();
    await expect(dialog.getByTestId("cook-result")).toContainText("Ignored: Garlic powder");
  });
});
