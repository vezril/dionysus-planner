import { expect, test } from "@playwright/test";

/**
 * openspec: meal-log-integration — full Meal Log happy path against a REAL
 * dionysus-service instance (create ingredient -> create recipe -> cook a
 * batch -> log a meal -> day view reflects it). Manually verified live
 * against the homelab deployment during implementation; this pins that
 * same walkthrough as an automated spec.
 *
 * Unlike every other e2e spec in this suite, this one talks to an external
 * service (dionysus-service) that the shared `webServer` config doesn't
 * provision. It is entirely inert (`test.skip`) unless `DIONYSUS_SERVICE_URL`
 * is set in the environment the Next.js server was started with — the
 * default required `e2e` CI job never sets it, so this spec no-ops there.
 * A separate, non-required `e2e-meal-log` CI job provisions a real
 * `calvinference/dionysus:dev` container and runs this spec against it.
 *
 * Fixture note: uses timestamp-suffixed names so repeated runs against a
 * persistent dionysus-service instance (e.g. the homelab) don't collide.
 */

const RUN_ID = `${Date.now()}`;
const INGREDIENT_NAME = `E2E Meal Log Ingredient ${RUN_ID}`;
const RECIPE_NAME = `E2E Meal Log Recipe ${RUN_ID}`;

test.describe("Meal Log flow", () => {
  test.skip(!process.env.DIONYSUS_SERVICE_URL, "requires a live DIONYSUS_SERVICE_URL");
  test.describe.configure({ mode: "serial" });

  test("create an ingredient", async ({ page }) => {
    await page.goto("/meal-log/ingredients");
    await expect(page.getByRole("heading", { level: 1, name: "Meal Log Ingredients" })).toBeVisible();

    await page.getByRole("textbox", { name: "Name" }).fill(INGREDIENT_NAME);
    await page.getByRole("spinbutton", { name: "Calories (kcal)" }).fill("100");
    await page.getByRole("spinbutton", { name: "Protein (g)" }).fill("5");
    await page.getByRole("spinbutton", { name: "Carbs (g)" }).fill("10");
    await page.getByRole("spinbutton", { name: "Fat (g)" }).fill("2");
    await page.getByRole("spinbutton", { name: "Sodium (mg)" }).fill("50");
    await page.getByRole("button", { name: "Add ingredient" }).click();

    await expect(page.getByTestId("meal-log-ingredient-row").filter({ hasText: INGREDIENT_NAME })).toBeVisible();
  });

  test("create a recipe from that ingredient", async ({ page }) => {
    await page.goto("/meal-log/recipes");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(RECIPE_NAME);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("2");

    await page.getByRole("combobox", { name: /Ingredient for line/ }).click();
    await page.getByRole("option", { name: INGREDIENT_NAME }).click();
    await page.getByRole("spinbutton", { name: /Quantity for line/ }).fill("100");
    await page.getByRole("textbox", { name: /Unit for line/ }).fill("g");
    await page.getByRole("button", { name: "Save recipe" }).click();

    await expect(page.getByTestId("meal-log-recipe-row").filter({ hasText: RECIPE_NAME })).toBeVisible();
  });

  test("cook a batch of that recipe", async ({ page }) => {
    await page.goto("/meal-log/batches");
    await page.getByRole("combobox", { name: "Recipe" }).click();
    await page.getByRole("option", { name: new RegExp(RECIPE_NAME) }).click();
    await page.getByRole("spinbutton", { name: "Servings made" }).fill("2");
    await page.getByRole("button", { name: "Cook batch" }).click();

    await expect(page.getByTestId("meal-log-batch-row").filter({ hasText: RECIPE_NAME })).toBeVisible();
  });

  test("log a meal against that batch and see it in the day view", async ({ page }) => {
    await page.goto("/meal-log/log");
    await page.getByRole("combobox", { name: /Batch for line/ }).click();
    await page.getByRole("option", { name: new RegExp(RECIPE_NAME) }).click();
    await page.getByRole("spinbutton", { name: /Portions for line/ }).fill("1");
    await page.getByRole("button", { name: "Log meal" }).click();

    await expect(page.getByTestId("log-meal-confirmation")).toBeVisible();

    await page.goto("/meal-log");
    await expect(page.getByTestId("day-log-meals")).toBeVisible();
    const sodiumText = await page.getByTestId("day-log-total-sodiumMg").innerText();
    expect(Number(sodiumText.replace(/\D/g, ""))).toBeGreaterThanOrEqual(50);
  });
});
