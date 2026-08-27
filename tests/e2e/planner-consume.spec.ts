import { expect, test, type Page } from "@playwright/test";

/**
 * openspec: planner-consume — Eat a planned batch entry on its own day;
 * planned portions are visible reservations that removal frees. Gated on
 * a live service exactly like planner-batches.spec.ts (inert without
 * DIONYSUS_SERVICE_URL; runs in the e2e-meal-log CI job).
 */
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const BROTH_NAME = `E2E PCON Broth ${RUN_ID}`;
const RECIPE_NAME = `E2E PCON Stew ${RUN_ID}`;

async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 12)}`);
  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();
  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

async function planPortions(page: Page, portions: string): Promise<void> {
  await page.getByRole("combobox", { name: "Plan recipe" }).click();
  await page.getByRole("option", { name: new RegExp(`${RECIPE_NAME} — ready to eat`) }).click();
  await page.getByLabel("Portions").fill(portions);
  await page.getByTestId("plan-add").click();
}

function ourEntry(page: Page) {
  return page.getByTestId("plan-entry").filter({ hasText: RECIPE_NAME });
}

function ourReadyRow(page: Page) {
  return page.getByTestId("planner-ready-batch").filter({ hasText: RECIPE_NAME });
}

test.describe("planner consume", () => {
  test.skip(!process.env.DIONYSUS_SERVICE_URL, "requires a live DIONYSUS_SERVICE_URL");
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("setup: cook a 40-portion batch (eating 0 now)", async ({ page }) => {
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(BROTH_NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Volume", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("30");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("2");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("4");
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
    await insertMention(page, BROTH_NAME, "800", "mL");
    await textarea.pressSequentially("until rich.");
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

  test("planning reserves visibly; Eat flips the entry to eaten on its day", async ({ page }) => {
    await page.goto("/planner");
    await expect(ourReadyRow(page)).toBeVisible();
    // Delta-based: a persistent dev DB can carry stale plans against
    // recycled service batch ids, so only OUR run-unique rows are judged.
    const before = Number((await ourReadyRow(page).textContent())!.match(/(\d+(?:\.\d+)?) portions available/)![1]);

    await planPortions(page, "2");
    await expect(ourEntry(page)).toBeVisible();
    await expect(ourReadyRow(page).getByTestId("planner-ready-planned")).toContainText("2 planned");
    const reserved = Number((await ourReadyRow(page).textContent())!.match(/(\d+(?:\.\d+)?) portions available/)![1]);
    expect(reserved).toBeCloseTo(before - 2, 5);

    await ourEntry(page).getByTestId("plan-entry-consume").click();
    await expect(ourEntry(page).getByTestId("plan-entry-consumed")).toHaveText("(eaten)");
    await expect(ourEntry(page).getByTestId("plan-entry-consume")).toHaveCount(0);
    // Consumed entries stop reserving — the service's own decrement is the
    // only thing that moved, so availability stays at before − 2 with no
    // planned badge left on our row.
    await expect(ourReadyRow(page).getByTestId("planner-ready-planned")).toHaveCount(0);
    const after = Number((await ourReadyRow(page).textContent())!.match(/(\d+(?:\.\d+)?) portions available/)![1]);
    expect(after).toBeCloseTo(before - 2, 5);
  });

  test("removing an unconsumed entry frees its reservation", async ({ page }) => {
    await page.goto("/planner");
    const start = Number((await ourReadyRow(page).textContent())!.match(/(\d+(?:\.\d+)?) portions available/)![1]);

    await planPortions(page, "3");
    await expect(ourReadyRow(page).getByTestId("planner-ready-planned")).toContainText("3 planned");

    const entry = ourEntry(page).filter({ hasText: "3 portions" });
    await entry.getByRole("button", { name: /^Remove / }).click();
    await expect(ourReadyRow(page).getByTestId("planner-ready-planned")).toHaveCount(0);
    const freed = Number((await ourReadyRow(page).textContent())!.match(/(\d+(?:\.\d+)?) portions available/)![1]);
    expect(freed).toBeCloseTo(start, 5);
  });
});
