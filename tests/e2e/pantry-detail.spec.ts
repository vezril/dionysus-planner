import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * openspec: pantry-item-detail — pantry item detail page: nutrition facts,
 * purchase logging/history, derived price stats, not-found boundary.
 *
 * Test-isolation: the shared persistent e2e DB means this suite creates its
 * OWN uniquely-named custom ingredient and pantry item, and asserts only on
 * its own fixture (never on counts). Serial: later tests build on earlier
 * ones' state.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * `/pantry` rows: the ingredient name is a link to `/pantry/{id}`.
 * `/pantry/{id}`:
 *   - h1 = ingredient name; `data-testid="pantry-detail-on-hand"` shows
 *     displayQuantity + displayUnit.
 *   - `data-testid="nutrition-facts"` with per-nutrient
 *     `data-testid="nutrition-<label>"`; absent optional fields render
 *     "not recorded", never 0.
 *   - purchase form: spinbutton "Price ($)", textbox "Store (optional)",
 *     spinbutton "Quantity (optional)", textbox "Unit", "Date" input,
 *     button "Log purchase".
 *   - history rows: `data-testid="purchase-row"`, each with a "Delete"
 *     button opening a confirm dialog ("Confirm delete").
 *   - stats: `data-testid="price-stats-last-paid"` / `-lowest`, or
 *     `data-testid="price-stats-empty"` when no purchases.
 * Unknown id -> the root not-found boundary ("Page not found").
 * ===========================================================================
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const INGREDIENT_NAME = `E2E Detail Ingredient ${RUN_ID}`;

async function createCustomIngredient(page: Page, name: string): Promise<void> {
  await page.goto("/ingredients/new");
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByRole("combobox", { name: "Unit class" }).click();
  await page.getByRole("option", { name: "Mass", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Calories" }).fill("40");
  await page.getByRole("spinbutton", { name: "Protein" }).fill("1.1");
  await page.getByRole("spinbutton", { name: "Carbs" }).fill("9");
  await page.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("0.1");
  await page.getByRole("spinbutton", { name: "Sodium" }).fill("4");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/ingredients\/?$/);
}

async function addPantryItem(page: Page, ingredientName: string): Promise<void> {
  await page.goto("/pantry");
  const headerTrigger = page.getByRole("button", { name: "Add pantry item", exact: true });
  const emptyStateTrigger = page.getByRole("button", { name: "Add your first pantry item" });
  if (await headerTrigger.isVisible().catch(() => false)) {
    await headerTrigger.click();
  } else {
    await emptyStateTrigger.click();
  }
  const dialog = page.getByRole("dialog", { name: "Add pantry item" });
  await expect(dialog).toBeVisible();
  const combobox = page.getByRole("combobox", { name: "Ingredient" });
  await combobox.click();
  await combobox.fill(ingredientName);
  await page.getByRole("option", { name: ingredientName, exact: true }).click();
  await dialog.getByLabel("Quantity").fill("500");
  await page.getByRole("combobox", { name: "Unit" }).click();
  await page.getByRole("option", { name: "g", exact: true }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();
}

function fixtureRow(page: Page): Locator {
  return page.getByTestId("pantry-row").filter({ hasText: INGREDIENT_NAME });
}

async function openDetail(page: Page): Promise<void> {
  await page.goto("/pantry");
  await fixtureRow(page).getByRole("link", { name: INGREDIENT_NAME }).click();
  await expect(page.getByRole("heading", { level: 1, name: INGREDIENT_NAME })).toBeVisible();
}

test.describe("pantry item detail", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "detail ACs verified once on chromium");
  });

  test("setup: create the fixture ingredient and pantry item", async ({ page }) => {
    await createCustomIngredient(page, INGREDIENT_NAME);
    await addPantryItem(page, INGREDIENT_NAME);
  });

  test("clicking the pantry row name opens the detail page with nutrition facts and on-hand quantity", async ({
    page,
  }) => {
    await openDetail(page);

    await expect(page.getByTestId("pantry-detail-on-hand")).toContainText("500 g");
    const facts = page.getByTestId("nutrition-facts");
    await expect(facts.getByTestId("nutrition-calories")).toContainText("40 kcal");
    await expect(facts.getByTestId("nutrition-sodium")).toContainText("4 mg");
    // Optional field never entered -> "not recorded", never a fake 0 (A-1).
    await expect(facts.getByTestId("nutrition-fiber")).toContainText("not recorded");

    await expect(page.getByTestId("price-stats-empty")).toBeVisible();
  });

  test("logging a price-only purchase adds it to the history and stats", async ({ page }) => {
    await openDetail(page);

    await page.getByRole("spinbutton", { name: "Price ($)" }).fill("5.99");
    await page.getByRole("button", { name: "Log purchase" }).click();

    await expect(page.getByTestId("purchase-row")).toHaveCount(1);
    await expect(page.getByTestId("price-stats-last-paid")).toContainText("$5.99");
  });

  test("logging a full purchase (store + quantity) updates lowest-price stats", async ({ page }) => {
    await openDetail(page);

    await page.getByRole("spinbutton", { name: "Price ($)" }).fill("4.49");
    await page.getByRole("textbox", { name: "Store (optional)" }).fill("Maxi");
    await page.getByRole("spinbutton", { name: "Quantity (optional)" }).fill("1");
    await page.getByRole("textbox", { name: "Unit", exact: true }).fill("kg");
    await page.getByRole("button", { name: "Log purchase" }).click();

    await expect(page.getByTestId("purchase-row")).toHaveCount(2);
    await expect(page.getByTestId("price-stats-lowest")).toContainText("$4.49");
    await expect(page.getByTestId("price-stats-lowest")).toContainText("Maxi");
  });

  test("a purchase without a price is rejected inline", async ({ page }) => {
    await openDetail(page);

    await page.getByRole("button", { name: "Log purchase" }).click();

    await expect(page.getByTestId("field-error-price")).toBeVisible();
    await expect(page.getByTestId("purchase-row")).toHaveCount(2);
  });

  test("history survives removing and re-adding the pantry item (keyed by ingredient)", async ({
    page,
  }) => {
    await page.goto("/pantry");
    await fixtureRow(page).getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Confirm remove" }).click();
    await expect(fixtureRow(page)).toHaveCount(0);

    await addPantryItem(page, INGREDIENT_NAME);
    await openDetail(page);

    await expect(page.getByTestId("purchase-row")).toHaveCount(2);
  });

  test("deleting a purchase removes it from history and stats", async ({ page }) => {
    await openDetail(page);

    // Delete the cheaper (top-of-stats) purchase: the 4.49 row.
    const cheapRow = page.getByTestId("purchase-row").filter({ hasText: "$4.49" });
    await cheapRow.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();

    await expect(page.getByTestId("purchase-row")).toHaveCount(1);
    await expect(page.getByTestId("price-stats-lowest")).toContainText("$5.99");
  });

  test("an unknown pantry item id renders the not-found boundary", async ({ page }) => {
    await page.goto("/pantry/9999999");
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  });
});

test.describe("pantry item detail at 375px (NFR-8)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-375", "375px assertion runs only in mobile-375");
  });

  test("detail page has no horizontal scroll at 375px", async ({ page }) => {
    // Reuses whatever pantry rows exist; falls back to skipping when the
    // pantry is empty in this worker's view (fixture creation is
    // chromium-serial and may not have run for this project).
    await page.goto("/pantry");
    const firstLink = page.getByTestId("pantry-row").getByRole("link").first();
    if (!(await firstLink.isVisible().catch(() => false))) {
      test.skip(true, "no pantry rows available in this project run");
    }
    await firstLink.click();
    await expect(page.getByTestId("nutrition-facts")).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });
});
