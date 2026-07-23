import { expect, test, type Page } from "@playwright/test";

/**
 * S-402 Recipe edit & delete — end-to-end coverage
 * (docs/stories/S-402-recipe-edit-delete.md AC1-AC4, FR-14, FR-15).
 *
 * Rewritten under openspec: cooklang-recipe-editor — the per-line picker
 * form is gone; both `/recipes/new` and `/recipes/[id]/edit` share the
 * same single "Instructions" mention-aware textarea (RecipeEditor is one
 * component in both modes, unchanged from before this rewrite).
 *
 * Test-isolation note (same discipline as tests/e2e/recipe-create.spec.ts
 * and tests/e2e/recipe-detail.spec.ts): the e2e DB (`.dev-data/`) is
 * persistent and shared across this whole `webServer` run. Every recipe
 * created here gets a unique, timestamped name.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Detail page (`/recipes/<id>`, S-403's existing page):
 *   - One `role="link"` with accessible name **"Edit recipe"**, `href`
 *     exactly `/recipes/<id>/edit`.
 *
 * Edit page (`/app/recipes/[id]/edit/page.tsx`), reusing the same editor:
 *   - `<h1>` whose text matches /edit recipe/i.
 *   - Same field set as `/recipes/new`: textbox "Recipe name", spinbutton
 *     "Servings", textbox "Instructions" (mention-aware), Save button
 *     reachable as `getByRole("button", { name: /save/i })`.
 *   - PRE-FILLED on load: name/servings match; the "Instructions" textarea
 *     is pre-filled with the EXACT stored body text, mentions and id
 *     annotations intact — a byte-for-byte round-trip (design.md Decision
 *     6), not a reconstruction from `recipe_line` rows.
 *   - Editing (changing servings, editing the body text, and/or adding a
 *     new mention) and saving persists the changes; the recipe's detail
 *     page (`/recipes/<id>`) subsequently reflects the new servings/line
 *     values AND recomputed nutrition totals, with zero separate
 *     cache-invalidation step (FR-14 AC2, ADR-011).
 *   - A `data-testid="delete-recipe"` element, ALSO reachable as
 *     `getByRole("button", { name: /delete/i })`. Clicking it opens
 *     `getByRole("dialog", { name: /delete/i })` containing
 *     `getByRole("button", { name: "Confirm delete", exact: true })` and
 *     `getByRole("button", { name: "Cancel", exact: true })`.
 *     - "Cancel" closes the dialog without navigating or deleting
 *       anything — the recipe still exists afterward.
 *     - "Confirm delete" invokes `deleteRecipe`: on success, the app
 *       navigates to `/recipes` and the deleted recipe's row
 *       (`data-testid="recipe-row"`) no longer appears there.
 * ===========================================================================
 */

/** Types `@query`, waits for the matching suggestion, and clicks it — works
 * identically on /recipes/new and /recipes/[id]/edit (same shared editor). */
async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 6)}`);

  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();

  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

interface MentionSpec {
  ingredientName: string;
  quantity: string;
  unit: string;
}

/** Creates a recipe via the editor UI; returns its `/recipes/<id>` href AND
 * the exact final Instructions textarea value (for round-trip assertions). */
async function createRecipeViaUI(
  page: Page,
  opts: { name: string; servings: string; mentions: MentionSpec[] },
): Promise<{ href: string; body: string }> {
  await page.goto("/recipes/new");
  await page.getByRole("textbox", { name: "Recipe name" }).fill(opts.name);
  await page.getByRole("spinbutton", { name: "Servings" }).fill(opts.servings);

  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.click();
  for (const m of opts.mentions) {
    await insertMention(page, m.ingredientName, m.quantity, m.unit);
  }
  const body = await textarea.inputValue();

  await page.getByRole("button", { name: "Save recipe" }).click();

  await page.goto("/recipes");
  const recipeRow = page.getByTestId("recipe-row").filter({ hasText: opts.name });
  await expect(recipeRow.first()).toBeVisible();

  const link = recipeRow.first().getByRole("link").first();
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/recipes\/\d+$/);

  return { href: href!, body };
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

  test("AC1/FR-14: the detail page's Edit link opens the edit page pre-filled with the recipe's current name, servings, and exact body text", async ({
    page,
  }) => {
    const recipeName = `E2E Edit Prefill ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const { href: detailHref, body } = await createRecipeViaUI(page, {
      name: recipeName,
      servings: "3",
      mentions: [
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

    // Round-trip: the stored body text comes back byte-for-byte, mentions
    // and id annotations intact — no reconstruction from recipe_line rows
    // (design.md Decision 6). `recipeSchema`'s `body: z.string().trim()`
    // trims the saved value, so compare against the trimmed capture too.
    await expect(page.getByRole("textbox", { name: "Instructions" })).toHaveValue(body.trim());
  });

  test("AC2/FR-14: changing servings, editing a mention's quantity, and adding a new mention persists and the detail page reflects recomputed nutrition", async ({
    page,
  }) => {
    const recipeName = `E2E Edit Save ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const { href: detailHref, body } = await createRecipeViaUI(page, {
      name: recipeName,
      servings: "3",
      mentions: [
        { ingredientName: GARLIC, quantity: "6", unit: "each" },
        { ingredientName: OLIVE_OIL, quantity: "25", unit: "mL" },
      ],
    });

    await page.goto(`${detailHref}/edit`);

    await page.getByRole("spinbutton", { name: "Servings" }).fill("5");

    // Garlic 6 -> 10 (string-replace within the exact stored body — the
    // mention's numeric id is unknown to the test, but this substring is
    // unique within this recipe's own body).
    const revisedBody = body.replace("{6%each}", "{10%each}");
    const textarea = page.getByRole("textbox", { name: "Instructions" });
    await textarea.fill(revisedBody);

    // Add a third mention via the real autocomplete flow.
    await textarea.click();
    await textarea.press("End");
    await insertMention(page, SQUASH_ACORN, "100", "g");

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

    const { href: detailHref } = await createRecipeViaUI(page, {
      name: recipeName,
      servings: "2",
      mentions: [{ ingredientName: GARLIC, quantity: "2", unit: "each" }],
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

    const { href: detailHref } = await createRecipeViaUI(page, {
      name: recipeName,
      servings: "2",
      mentions: [{ ingredientName: GARLIC, quantity: "2", unit: "each" }],
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
