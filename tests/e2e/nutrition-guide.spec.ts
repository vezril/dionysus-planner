import { expect, test } from "@playwright/test";

/**
 * openspec: nutrition-targets-guide — the Guide's tiers + editor, and the
 * recipe view's percent-of-target readout reacting to a tuned target.
 */
test.describe("nutrition guide + targets", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("the Guide shows the CCSA tiers and saves a tuned target", async ({ page }) => {
    await page.goto("/guide");
    await expect(page.getByTestId("alcohol-tiers")).toContainText("3–6 / week");
    await expect(page.getByTestId("alcohol-tiers")).toContainText("Moderate risk");

    await page.locator("#target-sodiumMg").fill("1500");
    await page.getByTestId("targets-save").click();
    await expect(page.getByTestId("targets-message")).toHaveText("Saved.");

    await page.reload();
    await expect(page.locator("#target-sodiumMg")).toHaveValue("1500");
  });

  test("recipe per-serving shows percent of the tuned daily target", async ({ page }) => {
    // Seeded 'Garlic powder' fixture recipe from the qol spec may not exist
    // in this run — create a deterministic one: 100 g flour-ish item.
    const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const NAME = `E2E Target Fit ${RUN_ID}`;
    await page.goto("/pantry");
    await page.getByRole("button", { name: "Create custom item" }).click();
    const dialog = page.getByRole("dialog", { name: "Create custom item" });
    await dialog.getByRole("textbox", { name: "Name" }).fill(NAME);
    await dialog.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Mass", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Calories" }).fill("100");
    await dialog.getByRole("spinbutton", { name: "Protein" }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Carbs" }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Fat (g)", exact: true }).fill("0");
    await dialog.getByRole("spinbutton", { name: "Sodium" }).fill("750");
    await dialog.getByRole("spinbutton", { name: "On hand now (0 is fine)" }).fill("500");
    await dialog.getByRole("combobox", { name: "Pantry unit" }).click();
    await page.getByRole("option", { name: "g", exact: true }).click();
    await dialog.getByRole("button", { name: "Create item" }).click();
    await expect(dialog).not.toBeVisible();

    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Recipe name" }).fill(`${NAME} recipe`);
    await page.getByRole("spinbutton", { name: "Servings" }).fill("1");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.click();
    await textarea.pressSequentially("Use ");
    await textarea.pressSequentially(`@${NAME.slice(0, 12)}`);
    await page.getByTestId("mention-option").filter({ hasText: NAME }).first().click();
    await textarea.pressSequentially("{200%g} done.");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      await page.getByTestId("recipe-row").filter({ hasText: `${NAME} recipe` }).getByRole("link").first().click();
    }

    // 200 g × 750 mg/100 g = 1500 mg per serving; the tuned cap is 1500 → 100%.
    await expect(page.getByTestId("nutrition-target-percent-sodium")).toHaveText("· 100%");
  });
});
