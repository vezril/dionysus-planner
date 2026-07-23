import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * S-502 "Adjustable near-match threshold" (docs/stories/S-502-near-match-
 * threshold.md AC-1, AC-3, AC-4; prd.md FR-23; architecture.md ADR-002 "the
 * near-match threshold slider" client island, ADR-004 the `/api/what-can-i-
 * cook?threshold=` Route Handler this control calls, ADR-006 shadcn Slider,
 * §6 Flow C).
 *
 * The What Can I Cook view (S-501) currently renders the Near Match section
 * server-side ONLY at the fixed env-resolved default threshold — there is
 * no slider control anywhere on the page. Every test below is intentionally
 * RED (the `near-match-threshold-slider` control does not exist yet) until
 * the implementer builds `ThresholdSlider` (a shadcn `Slider`-based client
 * component) and `app/api/what-can-i-cook/route.ts`.
 *
 * Test-isolation note (same discipline as tests/e2e/what-can-i-cook.spec.ts):
 * the e2e DB is persistent and shared across this whole `webServer` run and
 * every other spec file (`fullyParallel: true`). This suite creates its OWN,
 * disjoint custom ingredients/recipe (unique, timestamped names) and never
 * asserts an exact missing-more COUNT — only that this suite's own fixture
 * recipe moves in and out of Near Match as the slider moves, and that the
 * summarized count decreases/increases accordingly (delta relaxed to ">=1";
 * the shared persistent e2e DB accumulates other specs' 4-line fixtures).
 *
 * Fixture shape: 4 dedicated ingredients, NEVER added to the pantry
 * (guaranteed MISSING). One recipe requires all 4 -> exactly 4 unsatisfied
 * lines. At the default threshold (3, per AC-4 / architecture §4 OQ-1) this
 * recipe exceeds the threshold and is excluded from Near Match, counted only
 * in the missing-more tail. Raising the threshold to 5 must surface it.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * `app/what-can-i-cook/page.tsx` gains a threshold control, a shadcn
 * `Slider`-based client component (`ThresholdSlider`, ADR-002/ADR-006):
 *
 *   - A wrapping element carries `data-testid="near-match-threshold-slider"`.
 *   - Inside it, `page.getByRole("slider", { name: "Near match threshold" })`
 *     resolves to exactly one element (the Radix Slider thumb) — i.e. the
 *     control's ACCESSIBLE NAME is exactly "Near match threshold".
 *   - That slider element's `aria-valuenow` attribute reflects the current
 *     threshold as a plain integer string.
 *   - On initial page load, with no user adjustment, `aria-valuenow` equals
 *     the env-resolved default (AC-4) — this suite's environment has
 *     `NEAR_MATCH_DEFAULT_THRESHOLD` unset, so that default is `3`.
 *   - The control is keyboard-operable per standard ARIA slider behavior
 *     (Radix default): a focused slider thumb's `ArrowRight` increases the
 *     value by 1 and `ArrowLeft` decreases it by 1.
 *   - Changing the value triggers a client-side `GET
 *     /api/what-can-i-cook?threshold=<N>` request (ADR-004's client-
 *     triggered re-read) and swaps the `near-match-section` /
 *     `missing-more-tail` content in place — NO full page navigation (this
 *     suite asserts the request fires via `page.waitForResponse` rather
 *     than a full reload, which is the direct, unambiguous proof of
 *     ADR-004's "no full page reload" requirement).
 * ===========================================================================
 */

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const ING_1_NAME = `E2E Threshold Ingredient 1 ${RUN_ID}`;
const ING_2_NAME = `E2E Threshold Ingredient 2 ${RUN_ID}`;
const ING_3_NAME = `E2E Threshold Ingredient 3 ${RUN_ID}`;
const ING_4_NAME = `E2E Threshold Ingredient 4 ${RUN_ID}`;
const FOUR_MISSING_RECIPE_NAME = `E2E Threshold Four Missing ${RUN_ID}`;

async function createCustomIngredient(page: Page, name: string): Promise<void> {
  await page.goto("/ingredients/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add ingredient", exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByRole("combobox", { name: "Unit class" }).click();
  await page.getByRole("option", { name: "Mass", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Calories" }).fill("100");
  await page.getByRole("spinbutton", { name: "Protein" }).fill("5");
  await page.getByRole("spinbutton", { name: "Carbs" }).fill("10");
  await page.getByRole("spinbutton", { name: "Fat" }).fill("2");

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/ingredients\/?$/);
}

/** Types `@query`, waits for the matching suggestion, and clicks it. */
async function insertMention(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 6)}`);

  const option = page.getByTestId("mention-option").filter({ hasText: ingredientName });
  await expect(option.first()).toBeVisible();
  await option.first().click();

  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

async function createRecipe(
  page: Page,
  name: string,
  lines: Array<{ ingredientName: string; quantity: string; unit: string }>,
): Promise<void> {
  await page.goto("/recipes/new");
  await expect(page.getByRole("heading", { level: 1, name: "New Recipe" })).toBeVisible();

  await page.getByRole("textbox", { name: "Recipe name" }).fill(name);
  await page.getByRole("spinbutton", { name: "Servings" }).fill("2");

  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.click();
  for (const line of lines) {
    await insertMention(page, line.ingredientName, line.quantity, line.unit);
  }
  await textarea.pressSequentially("E2E threshold fixture — combine and serve.");

  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
}

function nearMatchRowFor(page: Page, recipeName: string): Locator {
  return page.getByTestId("near-match-section").getByTestId("near-match-recipe-row").filter({ hasText: recipeName });
}

function thresholdSlider(page: Page): Locator {
  return page.getByRole("slider", { name: "Near match threshold" });
}

async function missingMoreCount(page: Page): Promise<number> {
  const text = await page.getByTestId("missing-more-count").innerText();
  const value = Number(text.trim());
  expect(Number.isFinite(value), `expected missing-more-count text to be a plain integer, got "${text}"`).toBe(true);
  return value;
}

test.describe("S-502 near-match threshold slider", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "threshold-slider ACs verified once on chromium");
  });

  test("setup: create 4 dedicated ingredients (never pantried) and a recipe requiring all 4 (guaranteed 4 unsatisfied lines)", async ({
    page,
  }) => {
    await createCustomIngredient(page, ING_1_NAME);
    await createCustomIngredient(page, ING_2_NAME);
    await createCustomIngredient(page, ING_3_NAME);
    await createCustomIngredient(page, ING_4_NAME);

    await createRecipe(page, FOUR_MISSING_RECIPE_NAME, [
      { ingredientName: ING_1_NAME, quantity: "50", unit: "g" },
      { ingredientName: ING_2_NAME, quantity: "50", unit: "g" },
      { ingredientName: ING_3_NAME, quantity: "50", unit: "g" },
      { ingredientName: ING_4_NAME, quantity: "50", unit: "g" },
    ]);
  });

  test("AC-4: the slider's initial value equals the env-resolved default threshold (3)", async ({ page }) => {
    await page.goto("/what-can-i-cook");

    const slider = thresholdSlider(page);
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute("aria-valuenow", "3");
  });

  test("at the default threshold (3), the 4-missing fixture recipe is in the missing-more tail, not a Near Match row", async ({
    page,
  }) => {
    await page.goto("/what-can-i-cook");

    await expect(nearMatchRowFor(page, FOUR_MISSING_RECIPE_NAME)).toHaveCount(0);
  });

  test("AC-1/FR-23: raising the slider from 3 to 5 surfaces the 4-missing recipe under Near Match via a client re-fetch, no full page reload", async ({
    page,
  }) => {
    await page.goto("/what-can-i-cook");

    const countBefore = await missingMoreCount(page);
    await expect(nearMatchRowFor(page, FOUR_MISSING_RECIPE_NAME)).toHaveCount(0);

    const slider = thresholdSlider(page);
    await slider.focus();

    const responsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/what-can-i-cook?threshold=5") && response.status() === 200,
    );
    await slider.press("ArrowRight"); // 3 -> 4
    await slider.press("ArrowRight"); // 4 -> 5
    await responsePromise;

    await expect(slider).toHaveAttribute("aria-valuenow", "5");

    const row = nearMatchRowFor(page, FOUR_MISSING_RECIPE_NAME);
    await expect(row).toBeVisible();
    await expect(row.getByTestId("unsatisfied-line")).toHaveCount(4);

    const countAfter = await missingMoreCount(page);
    // ">= 1 fewer" not "exactly 1": other spec files accumulate 4-line fixtures
    // in the shared persistent DB, so an exact delta is order-dependent.
    expect(countAfter).toBeLessThan(countBefore);

    // No full page navigation occurred — the page URL is unchanged and the
    // heading (an RSC-rendered element from the original load) is still
    // present without a fresh `page.goto`.
    await expect(page).toHaveURL(/\/what-can-i-cook$/);
    await expect(page.getByRole("heading", { level: 1, name: "What Can I Cook" })).toBeVisible();
  });

  test("lowering the slider back from 5 to 3 hides the recipe again via another client re-fetch", async ({ page }) => {
    await page.goto("/what-can-i-cook");

    const slider = thresholdSlider(page);
    await slider.focus();

    const raisePromise = page.waitForResponse(
      (response) => response.url().includes("/api/what-can-i-cook?threshold=5") && response.status() === 200,
    );
    await slider.press("ArrowRight");
    await slider.press("ArrowRight");
    await raisePromise;
    await expect(nearMatchRowFor(page, FOUR_MISSING_RECIPE_NAME)).toBeVisible();

    const countAtFive = await missingMoreCount(page);

    const lowerPromise = page.waitForResponse(
      (response) => response.url().includes("/api/what-can-i-cook?threshold=3") && response.status() === 200,
    );
    await slider.press("ArrowLeft");
    await slider.press("ArrowLeft");
    await lowerPromise;

    await expect(slider).toHaveAttribute("aria-valuenow", "3");
    await expect(nearMatchRowFor(page, FOUR_MISSING_RECIPE_NAME)).toHaveCount(0);

    const countAtThree = await missingMoreCount(page);
    expect(countAtThree).toBeGreaterThan(countAtFive);
  });
});
