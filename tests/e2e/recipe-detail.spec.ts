import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * S-403 Recipe detail with computed nutrition — end-to-end coverage
 * (docs/stories/S-403-recipe-detail-nutrition.md AC1-AC6, UJ-4, FR-17,
 * FR-18, FR-19, FR-9, FR-11, FR-3/ADR-011). Fulfills every e2e TEST task
 * in the story's task list (the story names the first one
 * `tests/e2e/recipe-nutrition.spec.ts`; all four e2e TEST tasks — UJ-4
 * totals/per-serving, FR-19 unresolved/incomplete, override propagation,
 * unknown-id not-found — are covered together in THIS file instead, one
 * cohesive detail-page suite).
 *
 * `/app/recipes/[id]/page.tsx` does not exist yet — every test below is
 * intentionally RED (404 / missing elements) until the implementer builds
 * it per architecture.md §6 Flow B: ONE query
 * (`recipeRepo.getWithLinesAndIngredients`) -> `domain/nutrition
 * .computeRecipeNutrition`, computed fresh on every view (ADR-011, no
 * caching/route-segment caching).
 *
 * Also resolves tests/e2e/shell.spec.ts's `test.fixme` placeholder for the
 * not-found half of AC4 — that placeholder is removed there in favor of
 * this file's "unknown recipe id" test below (this file owns test files,
 * so it can retire the deferral cleanly instead of leaving a stale
 * duplicate).
 *
 * Test-isolation note (same discipline as tests/e2e/recipe-create.spec.ts
 * and tests/e2e/ingredient-edit.spec.ts): the e2e DB (`.dev-data/`) is
 * persistent and shared across this whole `webServer` run, across every
 * spec file, running with `fullyParallel: true`. Every recipe created here
 * gets a unique, timestamped name so this file's assertions never depend
 * on total recipe/ingredient counts. The only WRITE to shared seeded data
 * anywhere in this file is the override-propagation test's edit of
 * "Carrot, medium"'s calories — chosen because no other spec file in this
 * repo reads or writes that ingredient by name (grepped at authoring time);
 * every other test here only READS seeded ingredient values (Garlic, Olive
 * oil, Squash acorn, Tomatoes cherry), which is always safe to do
 * concurrently with any other worker.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Recipe list (`/recipes`, existing S-401 content) — NEW requirement added
 * by this story: each `data-testid="recipe-row"` contains (or is) a
 * `role="link"` whose `href` is exactly `/recipes/<id>` — the only way a
 * user reaches the detail page from the list (S-404 still owns the list's
 * search/sort/filter feature set; this is just the minimal navigation
 * affordance the detail page's own story needs to be reachable at all,
 * the same pattern `/ingredients` already uses for its edit links).
 *
 * Detail page (`/app/recipes/[id]/page.tsx`, RSC, architecture §5):
 *   - One `<h1>` whose accessible name is the recipe's name.
 *   - `data-testid="recipe-servings"` — text contains the servings count.
 *   - `data-testid="recipe-instructions"` — text contains the instructions
 *     verbatim.
 *   - One `data-testid="recipe-line"` per recipe line, each containing:
 *     - the constituent ingredient's name as visible text;
 *     - `data-testid="recipe-line-quantity"` whose text is EXACTLY
 *       `"<displayQuantity> <displayUnit>"` (FR-9 — the user's originally
 *       entered quantity/unit, verbatim, never the canonical value);
 *     - `data-testid="recipe-line-unresolved"`, present ONLY when that
 *       line resolved to `'UNRESOLVED'` (FR-11), with text matching
 *       /unresolved.*cannot compare units/i; absent entirely on a
 *       resolved line.
 *   - `data-testid="nutrition-totals"` wrapping one element per nutrient,
 *     `data-testid="nutrition-total-<key>"` for
 *     `calories|protein|carbs|fat|fiber|sugar|sodium`, each element's text
 *     EXACTLY equal to `domain/nutrition.ts#formatNutritionForDisplay`'s
 *     output for that field (whole kcal / 0.1 g / 0.1 mg / "N/A").
 *   - `data-testid="nutrition-per-serving"` wrapping the same seven
 *     `data-testid="nutrition-per-serving-<key>"` elements, = totals /
 *     servings (FR-18), same formatting rule.
 *   - Computed FRESH on every request — no route-segment caching (ADR-011;
 *     `export const dynamic = "force-dynamic"` or equivalent) — verified
 *     by the override-propagation test below.
 *
 * Unknown id (`/recipes/999999999`): renders the nearest `not-found.tsx`
 * boundary (the existing root one, per architecture §6 — "not-found.tsx
 * covers bad recipe/ingredient IDs") — visible text matching /not found/i.
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

/**
 * Creates a recipe via the S-401 editor UI and navigates to its detail
 * page via the list's (this story's newly-pinned) row link. Returns the
 * detail page URL's numeric id for reuse (e.g. revisiting after an
 * override).
 */
async function createRecipeAndOpenDetail(
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
  expect(href, "recipe-row must link to /recipes/<id> (this story's pinned contract)").toMatch(/^\/recipes\/\d+$/);

  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));

  return href!;
}

// Distinctive, single-match seeded ingredient names (data/seed/seed-data.json,
// S-204) with known, hand-verified nutrition values.
const GARLIC = "Garlic, 1 clove"; // COUNT, ref=1 each: 4 kcal, 0.2p, 1.0c, 0.0f, 0.1 fiber, 0.0 sugar, 1 mg sodium
const OLIVE_OIL = "Olive oil, extra virgin"; // VOLUME, ref=100 mL: 807 kcal, 0p, 0c, 91.3f, 0 fiber, 0 sugar, 2 mg sodium
const SQUASH_ACORN = "Squash, acorn, raw"; // MASS, ref=100 g: 40 kcal, 0.8p, 10.4c, 0.1f, 1.5 fiber, sugar=NULL, 3 mg sodium
const TOMATOES_CHERRY = "Tomatoes, cherry"; // MASS, ref=100 g, densityGPerMl=null (no cross-class conversion possible)
const CARROT = "Carrot, medium"; // COUNT, ref=1 each: 25 kcal, 0.5p, 5.9c, 0.1f (overridden in the propagation test)

test.describe("S-403 recipe detail — nutrition display", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("AC1/AC2/FR-9: totals, per-serving, and verbatim line quantities match a hand calculation", async ({
    page,
  }) => {
    const recipeName = `E2E Detail Recipe ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    await createRecipeAndOpenDetail(page, {
      name: recipeName,
      servings: "5",
      instructions: "Combine and serve.",
      lines: [
        { ingredientName: GARLIC, quantity: "6", unit: "each" },
        { ingredientName: OLIVE_OIL, quantity: "25", unit: "mL" },
      ],
    });

    await expect(page.getByRole("heading", { level: 1, name: recipeName })).toBeVisible();
    await expect(page.getByTestId("recipe-servings")).toContainText("5");
    await expect(page.getByTestId("recipe-instructions")).toContainText("Combine and serve.");

    const lines = page.getByTestId("recipe-line");
    await expect(lines).toHaveCount(2);

    const garlicLine = lines.filter({ hasText: GARLIC });
    await expect(garlicLine.getByTestId("recipe-line-quantity")).toHaveText("6 each");
    await expect(garlicLine.getByTestId("recipe-line-unresolved")).toHaveCount(0);

    const oilLine = lines.filter({ hasText: OLIVE_OIL });
    await expect(oilLine.getByTestId("recipe-line-quantity")).toHaveText("25 mL");
    await expect(oilLine.getByTestId("recipe-line-unresolved")).toHaveCount(0);

    // Hand calculation (garlic scale=6, olive oil scale=25/100=0.25):
    //   calories = 4*6 + 807*0.25 = 24 + 201.75 = 225.75 -> round -> 226 kcal
    //   protein  = 0.2*6 + 0       = 1.2 g
    //   carbs    = 1.0*6 + 0       = 6.0 g
    //   fat      = 0*6 + 91.3*0.25 = 22.825 -> 22.8 g
    //   fiber    = 0.1*6 + 0       = 0.6 g
    //   sugar    = 0*6 + 0         = 0.0 g   (legit zero, not incomplete)
    //   sodium   = 1*6 + 2*0.25    = 6.5 mg
    await expect(page.getByTestId("nutrition-total-calories")).toHaveText("226 kcal");
    await expect(page.getByTestId("nutrition-total-protein")).toHaveText("1.2 g");
    await expect(page.getByTestId("nutrition-total-carbs")).toHaveText("6.0 g");
    await expect(page.getByTestId("nutrition-total-fat")).toHaveText("22.8 g");
    await expect(page.getByTestId("nutrition-total-fiber")).toHaveText("0.6 g");
    await expect(page.getByTestId("nutrition-total-sugar")).toHaveText("0.0 g");
    await expect(page.getByTestId("nutrition-total-sodium")).toHaveText("6.5 mg");

    // Per-serving = totals / 5 (FR-18).
    await expect(page.getByTestId("nutrition-per-serving-calories")).toHaveText("45 kcal");
    await expect(page.getByTestId("nutrition-per-serving-protein")).toHaveText("0.2 g");
    await expect(page.getByTestId("nutrition-per-serving-carbs")).toHaveText("1.2 g");
    await expect(page.getByTestId("nutrition-per-serving-fat")).toHaveText("4.6 g");
    await expect(page.getByTestId("nutrition-per-serving-fiber")).toHaveText("0.1 g");
    await expect(page.getByTestId("nutrition-per-serving-sugar")).toHaveText("0.0 g");
    await expect(page.getByTestId("nutrition-per-serving-sodium")).toHaveText("1.3 mg");
  });

  test("AC3/AC4/FR-19: a missing optional field shows N/A, never 0, while other totals compute normally", async ({
    page,
  }) => {
    const recipeName = `E2E Missing Optional ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Squash, acorn, raw has sugarPerRef = null; Garlic's sugar is 0 (present).
    // One constituent missing sugar -> the SUGAR total/per-serving is
    // incomplete (N/A) — everything else (including fat, which is a small
    // but legitimate nonzero number here) still computes.
    await createRecipeAndOpenDetail(page, {
      name: recipeName,
      servings: "2",
      instructions: "n/a",
      lines: [
        { ingredientName: GARLIC, quantity: "6", unit: "each" },
        { ingredientName: SQUASH_ACORN, quantity: "200", unit: "g" },
      ],
    });

    await expect(page.getByTestId("nutrition-total-sugar")).toHaveText("N/A");
    await expect(page.getByTestId("nutrition-per-serving-sugar")).toHaveText("N/A");

    // Hand calculation (garlic scale=6, squash scale=200/100=2):
    //   calories = 4*6 + 40*2   = 24 + 80   = 104 kcal
    //   protein  = 0.2*6 + 0.8*2 = 1.2 + 1.6 = 2.8 g
    //   carbs    = 1.0*6 + 10.4*2 = 6.0 + 20.8 = 26.8 g
    //   fat      = 0*6 + 0.1*2  = 0.2 g
    //   fiber    = 0.1*6 + 1.5*2 = 0.6 + 3.0 = 3.6 g
    //   sodium   = 1*6 + 3*2    = 6 + 6 = 12.0 mg
    await expect(page.getByTestId("nutrition-total-calories")).toHaveText("104 kcal");
    await expect(page.getByTestId("nutrition-total-protein")).toHaveText("2.8 g");
    await expect(page.getByTestId("nutrition-total-carbs")).toHaveText("26.8 g");
    await expect(page.getByTestId("nutrition-total-fat")).toHaveText("0.2 g");
    await expect(page.getByTestId("nutrition-total-fiber")).toHaveText("3.6 g");
    await expect(page.getByTestId("nutrition-total-sodium")).toHaveText("12.0 mg");
  });

  test("AC3/FR-11/FR-19: an unresolved line (cross-unit-class, no density) flags required-macro totals N/A and the line itself", async ({
    page,
  }) => {
    const recipeName = `E2E Unresolved Line ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Tomatoes, cherry is MASS-primary with NO density set — entering it in
    // cups (VOLUME) cannot be resolved (FR-11). Garlic's line resolves fine.
    await createRecipeAndOpenDetail(page, {
      name: recipeName,
      servings: "2",
      instructions: "n/a",
      lines: [
        { ingredientName: GARLIC, quantity: "6", unit: "each" },
        { ingredientName: TOMATOES_CHERRY, quantity: "1", unit: "cup" },
      ],
    });

    const lines = page.getByTestId("recipe-line");
    const tomatoLine = lines.filter({ hasText: TOMATOES_CHERRY });
    await expect(tomatoLine.getByTestId("recipe-line-unresolved")).toBeVisible();
    await expect(tomatoLine.getByTestId("recipe-line-unresolved")).toHaveText(
      /unresolved.*cannot compare units/i,
    );

    const garlicLine = lines.filter({ hasText: GARLIC });
    await expect(garlicLine.getByTestId("recipe-line-unresolved")).toHaveCount(0);

    // Required macros are incomplete (N/A) — NEVER a silent 0 or a
    // wrong partial number contributed only by the resolved garlic line.
    for (const key of ["calories", "protein", "carbs", "fat"]) {
      await expect(page.getByTestId(`nutrition-total-${key}`)).toHaveText("N/A");
      await expect(page.getByTestId(`nutrition-per-serving-${key}`)).toHaveText("N/A");
    }
  });

  test("AC5/ADR-011: overriding a seeded ingredient's calories is reflected on the next detail view, no cache step", async ({
    page,
  }) => {
    const recipeName = `E2E Override Propagation ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const detailHref = await createRecipeAndOpenDetail(page, {
      name: recipeName,
      servings: "1",
      instructions: "n/a",
      lines: [{ ingredientName: CARROT, quantity: "2", unit: "each" }],
    });

    // Before: Carrot, medium is 25 kcal/each * 2 = 50 kcal.
    await expect(page.getByTestId("nutrition-total-calories")).toHaveText("50 kcal");

    // Override Carrot's calories via S-302's edit form (S-302 flow).
    await page.goto("/ingredients");
    const searchBox = page.getByRole("textbox", { name: "Search ingredients" });
    await searchBox.fill(CARROT);
    const carrotRow = page.getByTestId("ingredient-row").filter({ hasText: CARROT }).first();
    await expect(carrotRow).toBeVisible();
    const editHref = await carrotRow.getByRole("link").first().getAttribute("href");
    await page.goto(editHref!);

    await page.getByRole("spinbutton", { name: "Calories" }).fill("40");
    await page.getByRole("button", { name: "Save" }).click();

    // Revisit the SAME recipe detail page — no manual invalidation step.
    await page.goto(detailHref);
    // After: 40 kcal/each * 2 = 80 kcal.
    await expect(page.getByTestId("nutrition-total-calories")).toHaveText("80 kcal");
  });

  test("AC6: an unknown recipe id renders the not-found boundary", async ({ page }) => {
    await page.goto("/recipes/999999999");
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
});
