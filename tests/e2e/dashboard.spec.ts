import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: consumption-dashboard — cook-and-eat a drink recipe, see it in
 * the dashboard with CRDM alcohol units. Service-gated like the other
 * cook-flow specs.
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const BEER_NAME = `E2E Dash Beer ${RUN_ID}`;
const RECIPE_NAME = `E2E Dash Shandy ${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

test.describe("consumption dashboard", () => {
  test.skip(!process.env.DIONYSUS_SERVICE_URL, "requires a live DIONYSUS_SERVICE_URL");
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("eaten drink shows calories and CRDM units on the day view", async ({ page }) => {
    // 5% ABV VOLUME drink, 355 mL on hand.
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(BEER_NAME);
    await dialog.getByRole("combobox", { name: "Category" }).click();
    await page.getByRole("option", { name: "Drink", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("42");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("0.5");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("3.6");
    await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Alcohol (% ABV)" }).fill("5");
    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("355");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "mL", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();

    // 1-serving recipe drinking the whole can; cook it eating 1 now.
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(RECIPE_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("1");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Pour ");
    await insertMention(page, BEER_NAME, "355", "mL");
    await textarea.pressSequentially("cold.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: RECIPE_NAME }).getByRole("link").first().click();
    }
    await page.getByTestId("cook-recipe").click();
    const cookDialog = page.getByRole("dialog", { name: /cook/i });
    await expect(cookDialog.getByRole("spinbutton", { name: "Eating now" })).toHaveValue("1");
    await cookDialog.getByTestId("cook-confirm").click();
    await expect(cookDialog.getByTestId("cook-result")).toBeVisible();

    // Day view: at least one meal, and at least 1.04 alcohol units.
    await page.goto("/dashboard?period=day");
    await expect(page.getByTestId("dashboard-total-meals")).not.toHaveText("0");
    const units = page.getByTestId("dashboard-total-alcohol-units");
    await expect(units).toBeVisible();
    const value = Number((await units.textContent())!.replace(" units", ""));
    expect(value).toBeGreaterThanOrEqual(1.04);
  });

  // openspec: dashboard-week-day-cards — the week is seven mini day
  // views; clicking one opens that day's detailed view.
  test("week view shows seven day cards and clicks through to the day", async ({ page }) => {
    await page.goto("/dashboard?period=week");
    const cards = page.getByTestId("dashboard-day-card");
    await expect(cards).toHaveCount(7);

    // Today holds the shandy logged above: a kcal summary, not "Nothing logged".
    const todayCard = cards.filter({ has: page.getByTestId("day-card-kcal") }).first();
    await expect(todayCard).toBeVisible();
    await expect(todayCard).toContainText("kcal");
    await expect(todayCard).toContainText(/meals?/);

    await todayCard.click();
    await expect(page).toHaveURL(/period=day&date=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByTestId("dashboard-range")).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByTestId("dashboard-total-meals")).not.toHaveText("0");
  });

  test("period tabs and navigation render", async ({ page }) => {
    await page.goto("/dashboard?period=week");
    await expect(page.getByTestId("dashboard-range")).toContainText("week of");
    await page.getByTestId("dashboard-period-year").click();
    await expect(page.getByTestId("dashboard-range")).toHaveText(/^\d{4}$/);
    await expect(page.getByTestId("dashboard-breakdown")).toBeVisible();
  });
});
