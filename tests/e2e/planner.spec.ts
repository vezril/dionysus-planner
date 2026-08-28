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

    // openspec: planner-day-click-and-calories — the calendar is the day
    // picker: target Wednesday by clicking its card.
    const wednesday = page.getByTestId("plan-day").nth(2);
    await wednesday.click();
    await expect(wednesday).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("plan-target-day")).toContainText("Wed");

    // Plan it once (300 of 400 mL) — it stops being cookable for the week.
    await page.getByRole("combobox", { name: "Plan recipe" }).click();
    await page.getByRole("option", { name: RECIPE_NAME }).click();
    await page.getByTestId("plan-add").click();

    const entry = wednesday.getByTestId("plan-entry").filter({ hasText: RECIPE_NAME });
    await expect(entry).toBeVisible();
    // 300 mL × 47 kcal/100 mL = 141 kcal for the 1-portion plan.
    await expect(entry.getByTestId("plan-entry-calories")).toContainText("141 kcal");
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

  // openspec: recipe-links-precision — the Eat + remove pair must stay
  // inside the day card at the 7-column desktop breakpoint (~130px wide).
  // NB: assert on the BUTTONS and the card's own scroll box, never on every
  // descendant rect — labels sit inside overflow-hidden boxes, so a clipped
  // (correct) label still reports an unclipped getBoundingClientRect.
  test("day-card entry controls stay inside the card", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/planner");
    await page.getByRole("combobox", { name: "Plan recipe" }).click();
    await page.getByRole("option", { name: RECIPE_NAME }).click();
    await page.getByLabel("Portions").fill("2");
    await page.getByTestId("plan-add").click();

    const entry = page.getByTestId("plan-entry").filter({ hasText: RECIPE_NAME });
    await expect(entry).toBeVisible();
    const day = page.getByTestId("plan-day").filter({ has: entry });

    const layout = await day.evaluate((card) => {
      const cardBox = card.getBoundingClientRect();
      const buttons = Array.from(card.querySelectorAll("button"));
      return {
        cardWidth: Math.round(cardBox.width),
        buttonCount: buttons.length,
        worstButtonOverflow: buttons.reduce(
          (worst, b) => Math.max(worst, b.getBoundingClientRect().right - cardBox.right),
          -Infinity,
        ),
        cardScrolls: card.scrollWidth > card.clientWidth,
        docScrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });

    // The 7-column breakpoint is the case that broke: a ~130px card.
    expect(layout.cardWidth).toBeLessThan(200);
    expect(layout.buttonCount).toBeGreaterThan(0);
    expect(layout.worstButtonOverflow).toBeLessThan(0);
    expect(layout.cardScrolls).toBe(false);
    expect(layout.docScrollsX).toBe(false);

    await entry.getByRole("button", { name: `Remove ${RECIPE_NAME}` }).click();
    await expect(entry).toHaveCount(0);
  });

  // openspec: nutrition-intake — a planned day totals its calories and
  // shows the share of the daily budget on the day card.
  test("a planned day shows its calorie total as a share of the daily budget", async ({ page }) => {
    await page.goto("/planner");
    await page.getByRole("combobox", { name: "Plan recipe" }).click();
    await page.getByRole("option", { name: RECIPE_NAME }).click();
    await page.getByLabel("Portions").fill("2");
    await page.getByTestId("plan-add").click();
    const entry = page.getByTestId("plan-entry").filter({ hasText: RECIPE_NAME });
    await expect(entry).toBeVisible();
    const day = page.getByTestId("plan-day").filter({ has: entry });
    await expect(day.getByTestId("plan-day-kcal")).toContainText("% of day");
    await entry.getByRole("button", { name: `Remove ${RECIPE_NAME}` }).click();
    await expect(entry).toHaveCount(0);
  });
});
