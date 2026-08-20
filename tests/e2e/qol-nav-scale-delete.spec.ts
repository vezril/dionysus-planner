import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: qol-nav-scale-delete — sidebar order + "Meals" label, portion
 * slider on the recipe view (linear display scaling, per-serving fixed),
 * delete-with-confirm from the recipe view.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Sidebar (`role=navigation` "Main"): links in order What Can I Cook,
 * Products, Pantry, Recipes, Inventory; "Inventory" → /meal-log.
 * `/recipes/{id}`: `data-testid="portion-slider"` wrapping
 * `getByRole("slider", { name: "Portions" })` (keyboard-operable, min 1,
 * max 4×servings, default servings, `data-testid="portion-count"` shows the
 * value); moving it rescales `recipe-line-quantity` and `nutrition-total-*`
 * linearly while `nutrition-per-serving-*` is unchanged; the untouched
 * default renders values identical to before. Delete: same dual-selector
 * button (`data-testid="delete-recipe"`, name /delete/i) + two-action
 * confirm dialog as the edit page, now on the detail page.
 * ===========================================================================
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const RECIPE_NAME = `E2E QoL Scale ${RUN_ID}`;
const GARLIC_POWDER = "Garlic powder"; // MASS, 331 kcal per 100 g (seed)

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 6)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("qol-nav-scale-delete", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("sidebar order is WCIC, Products, Pantry, Recipes, Inventory", async ({ page }) => {
    await page.goto("/pantry");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link")).toHaveText([
      "What Can I Cook",
      "Products",
      "Pantry",
      "Recipes",
      "Inventory",
    ]);
    await expect(nav.getByRole("link", { name: "Inventory" })).toHaveAttribute("href", "/meal-log");
  });

  test("portion slider rescales lines and totals linearly; per-serving fixed", async ({ page }) => {
    // 4-serving recipe with one 2 g garlic line.
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(RECIPE_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("4");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Mince ");
    await insertMention(page, GARLIC_POWDER, "2", "g");
    await textarea.pressSequentially("and serve.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME }).getByRole("link").first().click();
    }

    const slider = page.getByRole("slider", { name: "Portions" });
    await expect(slider).toBeVisible();
    await expect(page.getByTestId("portion-count")).toHaveText("4");
    const quantity = page.getByTestId("recipe-line-quantity");
    await expect(quantity).toHaveText("2 g");
    // 2 g × 331 kcal/100 g = 6.62 → "7 kcal"; per serving 6.62/4 → "2 kcal".
    await expect(page.getByTestId("nutrition-total-calories")).toHaveText("7 kcal");
    await expect(page.getByTestId("nutrition-per-serving-calories")).toHaveText("2 kcal");

    // 4 → 6 portions: factor 1.5.
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("portion-count")).toHaveText("6");
    await expect(quantity).toHaveText("3 g");
    // Totals scaled (6.62 × 1.5 = 9.93 → "10 kcal"), per-serving untouched.
    await expect(page.getByTestId("nutrition-total-calories")).toHaveText("10 kcal");
    await expect(page.getByTestId("nutrition-per-serving-calories")).toHaveText("2 kcal");

    // Back to the default restores the original rendering.
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("portion-count")).toHaveText("4");
    await expect(quantity).toHaveText("2 g");
    await expect(page.getByTestId("nutrition-total-calories")).toHaveText("7 kcal");
  });

  test("delete from the detail page: cancel is a no-op, confirm removes the recipe", async ({ page }) => {
    await page.goto("/recipes");
    await page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME }).getByRole("link").first().click();
    await expect(page).toHaveURL(/\/recipes\/\d+$/);
    const detailUrl = page.url();

    await page.getByTestId("delete-recipe").click();
    const dialog = page.getByRole("dialog", { name: /delete/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(detailUrl);

    await page.getByTestId("delete-recipe").click();
    await page.getByRole("dialog", { name: /delete/i }).getByRole("button", { name: "Confirm delete" }).click();
    await expect(page).toHaveURL(/\/recipes$/);
    await expect(page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME })).toHaveCount(0);
  });
});
