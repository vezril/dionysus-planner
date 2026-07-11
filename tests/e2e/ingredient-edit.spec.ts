import { expect, test } from "@playwright/test";

/**
 * S-302 Ingredient create & nutrition override — end-to-end coverage
 * (docs/stories/S-302-ingredient-create-override.md AC-1 through AC-6,
 * FR-2, FR-3, FR-4's UI half, FR-12).
 *
 * Fresh-install context: the built app boots with the checked-in 351-row
 * seed (S-204) before serving any request (architecture.md §6 Flow A), so
 * `/ingredients` always has ≥300 rows and at least one SEEDED row to edit
 * (tests/e2e/ingredients.spec.ts's same assumption).
 *
 * Neither `/ingredients/new` nor `/ingredients/[id]/edit` exists yet
 * (S-301's catalog links to `/ingredients/<id>/edit`, which 404s today per
 * that story's own note) — every test below is intentionally RED until the
 * implementer builds both routes/forms + the two Server Actions.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Catalog CTA (`/ingredients`, S-301's existing page):
 *   - One `role="link"` with accessible name **"Add ingredient"**, `href`
 *     exactly `/ingredients/new`.
 *
 * Create form (`/ingredients/new`, client component per ADR-002):
 *   - One `<h1>` with accessible name **"Add ingredient"**.
 *   - Fields, all reachable by accessible name (label/aria-label — works
 *     with a shadcn `<Select>` rendering `role="combobox"` for unit class,
 *     and `type="number"` inputs rendering `role="spinbutton"`):
 *       - textbox "Name"
 *       - combobox "Unit class" (options include Mass / Volume / Count)
 *       - spinbutton "Calories"
 *       - spinbutton "Protein"
 *       - spinbutton "Carbs"
 *       - spinbutton "Fat"
 *       - spinbutton "Fiber" (optional)
 *       - spinbutton "Sugar" (optional)
 *       - spinbutton "Sodium" (optional)
 *       - spinbutton "Density" (optional, FR-12)
 *   - Submit: `role="button"` name **"Save"**.
 *   - Client-side (react-hook-form + zodResolver, ADR-005) validation
 *     blocks submission when required fields are missing/invalid: each
 *     violated field renders `data-testid="field-error-<key>"` (key ===
 *     the ingredientSchema field name verbatim, e.g. `field-error-name`,
 *     `field-error-unitClass`, `field-error-caloriesPerRef`, ...). The
 *     page does NOT navigate away on a blocked submit.
 *   - On successful save: creates a CUSTOM ingredient and redirects to
 *     `/ingredients` (the catalog, so the new row is immediately visible).
 *
 * Edit / override form (`/ingredients/[id]/edit`):
 *   - Reuses the same field set as the create form, PRE-FILLED with the
 *     target ingredient's current values (name, unit class, all macros).
 *   - Same "Save" button / same inline `field-error-*` validation contract.
 *   - On successful save: redirects to (or re-renders) `/ingredients`
 *     with the updated value visible in the catalog row.
 *   - No delete control anywhere on this page for a SEEDED ingredient
 *     (FR-4's UI half — presence check only; delete itself is S-303): no
 *     `role="button"` with an accessible name matching /delete/i, and no
 *     `data-testid="delete-ingredient"` element.
 * ===========================================================================
 */

const MIN_SEEDED_INGREDIENT_COUNT = 300;

test.describe("S-302 ingredient create & override forms", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "form ACs verified once on chromium");
  });

  test("AC-1/AC-2: create form — incomplete submission is blocked with inline errors; completing it creates a CUSTOM ingredient visible in the catalog", async ({
    page,
  }) => {
    await page.goto("/ingredients");

    const addLink = page.getByRole("link", { name: "Add ingredient" });
    await expect(addLink).toBeVisible();
    await expect(addLink).toHaveAttribute("href", "/ingredients/new");
    await addLink.click();

    await expect(page).toHaveURL(/\/ingredients\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "Add ingredient", exact: true })).toBeVisible();

    // Submit with everything empty — required fields must block save.
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByTestId("field-error-name")).toBeVisible();
    await expect(page.getByTestId("field-error-unitClass")).toBeVisible();
    await expect(page.getByTestId("field-error-caloriesPerRef")).toBeVisible();
    await expect(page.getByTestId("field-error-proteinPerRef")).toBeVisible();
    await expect(page.getByTestId("field-error-carbsPerRef")).toBeVisible();
    await expect(page.getByTestId("field-error-fatPerRef")).toBeVisible();
    // Blocked submit never navigates away from the create form.
    await expect(page).toHaveURL(/\/ingredients\/new$/);

    // Now complete it with a valid payload.
    const uniqueName = `E2E Custom Ingredient ${Date.now()}`;
    await page.getByRole("textbox", { name: "Name" }).fill(uniqueName);
    await page.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Mass", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Calories" }).fill("120");
    await page.getByRole("spinbutton", { name: "Protein" }).fill("5");
    await page.getByRole("spinbutton", { name: "Carbs" }).fill("10");
    await page.getByRole("spinbutton", { name: "Fat" }).fill("3");

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/ingredients\/?$/);

    const searchBox = page.getByRole("textbox", { name: "Search ingredients" });
    await searchBox.fill(uniqueName);

    const rows = page.getByTestId("ingredient-row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(uniqueName);
    await expect(rows.first().getByTestId("source-badge")).toHaveText("CUSTOM");
  });

  test("AC-4: editing a SEEDED ingredient's edit form pre-fills its values and shows no delete control", async ({
    page,
  }) => {
    await page.goto("/ingredients");

    const rows = page.getByTestId("ingredient-row");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(MIN_SEEDED_INGREDIENT_COUNT);

    // Find the first SEEDED row (guaranteed to exist on a fresh seeded install).
    const rowCount = await rows.count();
    let seededRow = null;
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const badgeText = await row.getByTestId("source-badge").innerText();
      if (badgeText === "SEEDED") {
        seededRow = row;
        break;
      }
    }
    expect(seededRow).not.toBeNull();

    const currentCalories = await seededRow!
      .locator("text=/kcal$/")
      .first()
      .innerText();
    const currentCalorieValue = Number(currentCalories.replace(/[^0-9.-]/g, ""));
    expect(Number.isFinite(currentCalorieValue)).toBe(true);

    const editLink = seededRow!.getByRole("link").first();
    const href = await editLink.getAttribute("href");
    await editLink.click();

    await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, "\\/") + "$"));

    const caloriesInput = page.getByRole("spinbutton", { name: "Calories" });
    await expect(caloriesInput).toHaveValue(String(currentCalorieValue));

    // FR-4 UI half: no delete affordance on a seeded ingredient's edit page.
    await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
    await expect(page.getByTestId("delete-ingredient")).toHaveCount(0);
  });

  test("AC-4: saving an edited calorie value on a SEEDED ingredient persists across a revisit", async ({ page }) => {
    await page.goto("/ingredients");

    const rows = page.getByTestId("ingredient-row");
    const rowCount = await rows.count();
    let seededHref: string | null = null;
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const badgeText = await row.getByTestId("source-badge").innerText();
      if (badgeText === "SEEDED") {
        seededHref = await row.getByRole("link").first().getAttribute("href");
        break;
      }
    }
    expect(seededHref).not.toBeNull();

    await page.goto(seededHref!);

    const caloriesInput = page.getByRole("spinbutton", { name: "Calories" });
    await expect(caloriesInput).toBeVisible();

    const newCalorieValue = "777";
    await caloriesInput.fill(newCalorieValue);
    await page.getByRole("button", { name: "Save" }).click();

    // Revisit the edit page directly and confirm the new value stuck.
    await page.goto(seededHref!);
    await expect(page.getByRole("spinbutton", { name: "Calories" })).toHaveValue(newCalorieValue);
  });

  test("FR-2: inline validation errors block save on the edit form too (clearing a required field)", async ({
    page,
  }) => {
    await page.goto("/ingredients");

    const firstRow = page.getByTestId("ingredient-row").first();
    const editHref = await firstRow.getByRole("link").first().getAttribute("href");
    await page.goto(editHref!);

    const caloriesInput = page.getByRole("spinbutton", { name: "Calories" });
    await expect(caloriesInput).toBeVisible();
    await caloriesInput.fill("-10");

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByTestId("field-error-caloriesPerRef")).toBeVisible();
    // Blocked submit never navigates away from the edit form.
    await expect(page).toHaveURL(new RegExp(editHref!.replace(/\//g, "\\/") + "$"));
  });
});
