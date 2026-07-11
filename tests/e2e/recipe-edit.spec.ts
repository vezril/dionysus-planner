import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * S-402 Recipe edit & delete — end-to-end coverage
 * (docs/stories/S-402-recipe-edit-delete.md AC1-AC4, FR-14, FR-15).
 *
 * Neither `/app/recipes/[id]/edit/page.tsx` nor any Edit/Delete affordance
 * exists yet (S-401's detail page — S-403 — has no edit link, and no
 * `updateRecipe`/`deleteRecipe` Server Actions exist) — every test below is
 * intentionally RED (404 / missing elements) until the implementer builds
 * the pre-filled editor (reusing S-401's editor component in edit mode per
 * the story's Dev Notes) and the delete confirmation flow.
 *
 * Test-isolation note (same discipline as tests/e2e/recipe-create.spec.ts
 * and tests/e2e/recipe-detail.spec.ts): the e2e DB (`.dev-data/`) is
 * persistent and shared across this whole `webServer` run, across every
 * spec file, running with `fullyParallel: true`. Every recipe created here
 * gets a unique, timestamped name so this file's mutations (including the
 * delete flow) never collide with another spec file's fixtures or a
 * parallel worker. This file does not touch tests/e2e/recipe-list.spec.ts
 * or tests/e2e/shell.spec.ts (a parallel S-404 pair owns the list's
 * search/sort feature set).
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Detail page (`/recipes/<id>`, S-403's existing page) — NEW affordance:
 *   - One `role="link"` with accessible name **"Edit recipe"**, `href`
 *     exactly `/recipes/<id>/edit`.
 *
 * Edit page (`/app/recipes/[id]/edit/page.tsx`), reusing S-401's editor
 * client component in edit mode (Dev Notes: "do not fork a second
 * editor"):
 *   - `<h1>` whose text matches /edit recipe/i.
 *   - Same field set/roles as `/recipes/new` (tests/e2e/recipe-create.spec.ts's
 *     pinned contract): textbox "Recipe name", spinbutton "Servings",
 *     textbox "Instructions", `data-testid="recipe-line-row"` per line
 *     (textbox "Ingredient", spinbutton "Quantity", combobox "Unit"),
 *     "Add ingredient line" button, and a Save button reachable as
 *     `getByRole("button", { name: /save/i })`.
 *   - PRE-FILLED on load: name/servings/instructions match the recipe's
 *     current values; exactly one `recipe-line-row` per existing line,
 *     each row's Ingredient textbox value equal to that line's
 *     constituent ingredient's name, Quantity spinbutton value equal to
 *     `displayQuantity`, Unit combobox showing `displayUnit` (FR-14 AC1).
 *   - Editing (changing servings, changing an existing line's quantity,
 *     and/or adding a new line) and saving persists the changes; the
 *     recipe's detail page (`/recipes/<id>`) subsequently reflects the new
 *     servings/line values AND recomputed nutrition totals, with zero
 *     separate cache-invalidation step (FR-14 AC2, ADR-011).
 *   - A `data-testid="delete-recipe"` element, ALSO reachable as
 *     `getByRole("button", { name: /delete/i })` (dual-selector shape
 *     matching this repo's established S-303 ingredient-delete pattern).
 *     Clicking it opens `getByRole("dialog", { name: /delete/i })`
 *     containing `getByRole("button", { name: "Confirm delete", exact: true })`
 *     and `getByRole("button", { name: "Cancel", exact: true })`.
 *     - "Cancel" closes the dialog without navigating or deleting
 *       anything — the recipe still exists afterward.
 *     - "Confirm delete" invokes `deleteRecipe`: on success, the app
 *       navigates to `/recipes` and the deleted recipe's row
 *       (`data-testid="recipe-row"`) no longer appears there.
 * ===========================================================================
 */

async function ensureLineRowCount(page: Page, count: number): Promise<void> {
  const addButton = page.getByRole("button", { name: "Add ingredient line" });
  while ((await page.getByTestId("recipe-line-row").count()) < count) {
    await addButton.click();
  }
}

async function fillLine(
  page: Page,
  row: Locator,
  ingredientName: string,
  quantity: string,
  unit: string,
): Promise<void> {
  const ingredientInput = row.getByRole("textbox", { name: "Ingredient" });
  await ingredientInput.fill(ingredientName);

  const option = row.getByTestId("recipe-ingredient-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();

  await row.getByRole("spinbutton", { name: "Quantity" }).fill(quantity);

  await row.getByRole("combobox", { name: "Unit" }).click();
  await page.getByRole("option", { name: unit, exact: true }).click();
}

interface LineSpec {
  ingredientName: string;
  quantity: string;
  unit: string;
}

/** Creates a recipe via the S-401 editor UI and returns its `/recipes/<id>` href. */
async function createRecipeViaUI(
  page: Page,
  opts: { name: string; servings: string; instructions: string; lines: LineSpec[] },
): Promise<string> {
  await page.goto("/recipes/new");
  await page.getByRole("textbox", { name: "Recipe name" }).fill(opts.name);
  await page.getByRole("spinbutton", { name: "Servings" }).fill(opts.servings);
  await page.getByRole("textbox", { name: "Instructions" }).fill(opts.instructions);

  await ensureLineRowCount(page, opts.lines.length);
  const rows = page.getByTestId("recipe-line-row");
  for (let i = 0; i < opts.lines.length; i++) {
    const line = opts.lines[i];
    await fillLine(page, rows.nth(i), line.ingredientName, line.quantity, line.unit);
  }

  await page.getByRole("button", { name: "Save recipe" }).click();

  await page.goto("/recipes");
  const recipeRow = page.getByTestId("recipe-row").filter({ hasText: opts.name });
  await expect(recipeRow.first()).toBeVisible();

  const link = recipeRow.first().getByRole("link").first();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/recipes\/\d+$/);

  return href!;
}

/** Finds the `recipe-line-row` whose Ingredient textbox value equals `ingredientName`. */
async function findLineRowByIngredientValue(page: Page, ingredientName: string): Promise<Locator> {
  const rows = page.getByTestId("recipe-line-row");
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const value = await row.getByRole("textbox", { name: "Ingredient" }).inputValue();
    if (value === ingredientName) {
      return row;
    }
  }
  throw new Error(`No recipe-line-row found with Ingredient value "${ingredientName}" among ${count} row(s)`);
}

// Distinctive, single-match seeded ingredient names (data/seed/seed-data.json,
// S-204) with known, hand-verified nutrition values (same fixtures
// tests/e2e/recipe-detail.spec.ts already relies on).
const GARLIC = "Garlic, 1 clove"; // COUNT, ref=1 each: 4 kcal, 0.2p, 1.0c, 0.0f, 0.1 fiber, 0.0 sugar, 1 mg sodium
const OLIVE_OIL = "Olive oil, extra virgin"; // VOLUME, ref=100 mL: 807 kcal, 0p, 0c, 91.3f, 0 fiber, 0 sugar, 2 mg sodium
const SQUASH_ACORN = "Squash, acorn, raw"; // MASS, ref=100 g: 40 kcal, 0.8p, 10.4c, 0.1f, 1.5 fiber, sugar=NULL, 3 mg sodium

test.describe("S-402 recipe edit & delete", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("AC1/FR-14: the detail page's Edit link opens the edit page pre-filled with the recipe's current name, servings, instructions, and lines", async ({
    page,
  }) => {
    const recipeName = `E2E Edit Prefill ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const detailHref = await createRecipeViaUI(page, {
      name: recipeName,
      servings: "3",
      instructions: "Original instructions.",
      lines: [
        { ingredientName: GARLIC, quantity: "6", unit: "each" },
        { ingredientName: OLIVE_OIL, quantity: "25", unit: "mL" },
      ],
    });

    await page.goto(detailHref);
    const editLink = page.getByRole("link", { name: "Edit recipe" });
    await expect(editLink).toBeVisible();
    await expect(editLink).toHaveAttribute("href", `${detailHref}/edit`);
    await editLink.click();

    await expect(page).toHaveURL(new RegExp(`${detailHref}/edit$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/edit recipe/i);

    await expect(page.getByRole("textbox", { name: "Recipe name" })).toHaveValue(recipeName);
    await expect(page.getByRole("spinbutton", { name: "Servings" })).toHaveValue("3");
    await expect(page.getByRole("textbox", { name: "Instructions" })).toHaveValue("Original instructions.");

    await expect(page.getByTestId("recipe-line-row")).toHaveCount(2);

    const garlicRow = await findLineRowByIngredientValue(page, GARLIC);
    await expect(garlicRow.getByRole("spinbutton", { name: "Quantity" })).toHaveValue("6");
    await expect(garlicRow.getByRole("combobox", { name: "Unit" })).toContainText("each");

    const oilRow = await findLineRowByIngredientValue(page, OLIVE_OIL);
    await expect(oilRow.getByRole("spinbutton", { name: "Quantity" })).toHaveValue("25");
    await expect(oilRow.getByRole("combobox", { name: "Unit" })).toContainText("mL");
  });

  test("AC2/FR-14: changing servings, changing a line's quantity, and adding a new line persists and the detail page reflects recomputed nutrition", async ({
    page,
  }) => {
    const recipeName = `E2E Edit Save ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const detailHref = await createRecipeViaUI(page, {
      name: recipeName,
      servings: "3",
      instructions: "Original instructions.",
      lines: [
        { ingredientName: GARLIC, quantity: "6", unit: "each" },
        { ingredientName: OLIVE_OIL, quantity: "25", unit: "mL" },
      ],
    });

    await page.goto(`${detailHref}/edit`);

    await page.getByRole("spinbutton", { name: "Servings" }).fill("5");

    const garlicRow = await findLineRowByIngredientValue(page, GARLIC);
    await garlicRow.getByRole("spinbutton", { name: "Quantity" }).fill("10");

    await ensureLineRowCount(page, 3);
    const newRow = page.getByTestId("recipe-line-row").nth(2);
    await fillLine(page, newRow, SQUASH_ACORN, "100", "g");

    await page.getByRole("button", { name: /save/i }).click();

    await expect(page).toHaveURL(new RegExp(`${detailHref}$`));

    await expect(page.getByTestId("recipe-servings")).toContainText("5");

    const lines = page.getByTestId("recipe-line");
    await expect(lines).toHaveCount(3);

    const garlicLine = lines.filter({ hasText: GARLIC });
    await expect(garlicLine.getByTestId("recipe-line-quantity")).toHaveText("10 each");

    const oilLine = lines.filter({ hasText: OLIVE_OIL });
    await expect(oilLine.getByTestId("recipe-line-quantity")).toHaveText("25 mL");

    const squashLine = lines.filter({ hasText: SQUASH_ACORN });
    await expect(squashLine.getByTestId("recipe-line-quantity")).toHaveText("100 g");

    // Hand calculation (garlic scale=10, olive oil scale=0.25, squash scale=1):
    //   calories = 4*10 + 807*0.25 + 40*1   = 40 + 201.75 + 40   = 281.75 -> 282 kcal
    //   protein  = 0.2*10 + 0 + 0.8         = 2.0 + 0.8           = 2.8 g
    //   carbs    = 1.0*10 + 0 + 10.4        = 10.0 + 10.4         = 20.4 g
    //   fat      = 0*10 + 91.3*0.25 + 0.1   = 22.825 + 0.1        = 22.925 -> 22.9 g
    //   fiber    = 0.1*10 + 0 + 1.5         = 1.0 + 1.5           = 2.5 g
    //   sugar    = squash's sugar is NULL -> incomplete -> N/A
    //   sodium   = 1*10 + 2*0.25 + 3        = 10 + 0.5 + 3        = 13.5 mg
    await expect(page.getByTestId("nutrition-total-calories")).toHaveText("282 kcal");
    await expect(page.getByTestId("nutrition-total-protein")).toHaveText("2.8 g");
    await expect(page.getByTestId("nutrition-total-carbs")).toHaveText("20.4 g");
    await expect(page.getByTestId("nutrition-total-fat")).toHaveText("22.9 g");
    await expect(page.getByTestId("nutrition-total-fiber")).toHaveText("2.5 g");
    await expect(page.getByTestId("nutrition-total-sugar")).toHaveText("N/A");
    await expect(page.getByTestId("nutrition-total-sodium")).toHaveText("13.5 mg");

    // Per serving = totals / 5 (FR-18).
    await expect(page.getByTestId("nutrition-per-serving-calories")).toHaveText("56 kcal");
    await expect(page.getByTestId("nutrition-per-serving-protein")).toHaveText("0.6 g");
    await expect(page.getByTestId("nutrition-per-serving-carbs")).toHaveText("4.1 g");
    await expect(page.getByTestId("nutrition-per-serving-fat")).toHaveText("4.6 g");
    await expect(page.getByTestId("nutrition-per-serving-fiber")).toHaveText("0.5 g");
    await expect(page.getByTestId("nutrition-per-serving-sugar")).toHaveText("N/A");
    await expect(page.getByTestId("nutrition-per-serving-sodium")).toHaveText("2.7 mg");
  });

  test("AC4/FR-15: deleting a recipe from the edit page — with confirmation — removes it and returns to the list", async ({
    page,
  }) => {
    const recipeName = `E2E Delete ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const detailHref = await createRecipeViaUI(page, {
      name: recipeName,
      servings: "2",
      instructions: "n/a",
      lines: [{ ingredientName: GARLIC, quantity: "2", unit: "each" }],
    });

    await page.goto(`${detailHref}/edit`);

    const deleteButton = page.getByTestId("delete-recipe");
    await expect(deleteButton).toBeVisible();
    await expect(page.getByRole("button", { name: /delete/i })).toBeVisible();

    await deleteButton.click();

    const confirmDialog = page.getByRole("dialog", { name: /delete/i });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Confirm delete", exact: true }).click();

    await expect(page).toHaveURL(/\/recipes\/?$/);
    await expect(page.getByTestId("recipe-row").filter({ hasText: recipeName })).toHaveCount(0);
  });

  test("AC4/FR-15: cancelling the delete confirmation dialog deletes nothing and leaves the recipe in place", async ({
    page,
  }) => {
    const recipeName = `E2E Delete Cancelled ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const detailHref = await createRecipeViaUI(page, {
      name: recipeName,
      servings: "2",
      instructions: "n/a",
      lines: [{ ingredientName: GARLIC, quantity: "2", unit: "each" }],
    });

    await page.goto(`${detailHref}/edit`);

    await page.getByTestId("delete-recipe").click();
    const confirmDialog = page.getByRole("dialog", { name: /delete/i });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirmDialog).not.toBeVisible();

    // Still on the edit page — cancelling never navigates or deletes.
    await expect(page).toHaveURL(new RegExp(`${detailHref}/edit$`));

    await page.goto("/recipes");
    await expect(page.getByTestId("recipe-row").filter({ hasText: recipeName })).toHaveCount(1);
  });
});
