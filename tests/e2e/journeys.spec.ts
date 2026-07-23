import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createTempDb,
  startIsolatedServer,
  stopIsolatedServer,
  type IsolatedServerHandle,
} from "../support/isolatedServer";

/**
 * S-503 end-to-end journeys + first-run sweep (docs/stories/S-503-e2e-
 * journeys-scale.md AC1, AC2; PRD §4 UJ-1 through UJ-5; FR-24; FR-29).
 *
 * ISOLATED, single-run DB (unlike every other `tests/e2e/*.spec.ts` file,
 * which shares one persistent DB/server across the whole
 * playwright.config.ts `webServer` run — see tests/e2e/shell.spec.ts's
 * own extensive comments on why a truly-fresh-install assertion can't be
 * made there). This file spawns its OWN `next start` process on a
 * dedicated port against a brand-new, throwaway `DB_PATH`
 * (tests/support/isolatedServer.ts), so:
 *   - the FR-29 first-run sweep below is a REAL "zero recipes, zero
 *     pantry items, seed-only catalog" assertion, not an approximation;
 *   - the UJ-1..UJ-5 journey can run as one coherent, ordered narrative
 *     (mode: "serial") without any risk of colliding with what another
 *     spec file or parallel worker wrote into the shared e2e DB.
 *
 * This suite deliberately does NOT re-verify the exact nutrition math,
 * shortfall phrasing, or unit-conversion edge cases already pinned in
 * tests/e2e/recipe-detail.spec.ts, tests/e2e/what-can-i-cook.spec.ts,
 * tests/e2e/pantry-edit.spec.ts, tests/e2e/ingredient-edit.spec.ts, etc.
 * — those own their detail-level assertions. This file composes the SAME
 * flows those files already exercise individually into continuous,
 * cross-story journeys (per the story's Dev Notes: "journeys are the
 * slower acceptance layer" on top of those files' "fast regression
 * layer"), asserting only the journey-level outcome at each step.
 *
 * Runs once, on chromium only (matches this whole repo's established
 * convention of running detailed functional ACs on a single engine and
 * leaving the cross-engine/375px matrix to dedicated, lighter specs —
 * see e.g. tests/e2e/recipe-create.spec.ts, tests/e2e/pantry-edit.spec.ts).
 * The full FR-29 empty-state sweep across all three evergreen engines
 * (this story's own `first-run.spec.ts` task) and the 375px sweep of
 * every primary view/form are NOT attempted in this file — see this
 * suite's hand-off notes for that remaining scope.
 */

const PORT = 3210;
const BASE_URL = `http://127.0.0.1:${PORT}`;

test.use({ baseURL: BASE_URL });

let server: IsolatedServerHandle;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const { dbPath } = createTempDb();
  server = await startIsolatedServer(PORT, dbPath);
});

test.afterAll(async () => {
  if (server) await stopIsolatedServer(server);
});

test.describe.configure({ mode: "serial" });

test.beforeEach(({}, testInfo) => {
  test.skip(
    !testInfo.project.name.includes("chromium"),
    "S-503 journeys run once, on chromium, against this file's own isolated fresh DB (see file header)",
  );
});

// ---------------------------------------------------------------------------
// Shared helpers (mirror the established contracts already pinned by
// tests/e2e/{ingredient-edit,pantry-edit,recipe-create,recipe-detail,
// what-can-i-cook}.spec.ts — reused here rather than re-derived).
// ---------------------------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function createCustomIngredient(
  page: Page,
  opts: {
    name: string;
    unitClass?: "Mass" | "Volume" | "Count";
    calories?: string;
    protein?: string;
    carbs?: string;
    fat?: string;
    sugar?: string;
  },
): Promise<void> {
  await page.goto("/ingredients/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add ingredient", exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Name" }).fill(opts.name);
  await page.getByRole("combobox", { name: "Unit class" }).click();
  await page.getByRole("option", { name: opts.unitClass ?? "Mass", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Calories" }).fill(opts.calories ?? "100");
  await page.getByRole("spinbutton", { name: "Protein" }).fill(opts.protein ?? "5");
  await page.getByRole("spinbutton", { name: "Carbs" }).fill(opts.carbs ?? "10");
  await page.getByRole("spinbutton", { name: "Fat" }).fill(opts.fat ?? "2");
  if (opts.sugar !== undefined) {
    await page.getByRole("spinbutton", { name: "Sugar" }).fill(opts.sugar);
  }

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/ingredients\/?$/);
}

async function overrideSeededCalories(page: Page, ingredientName: string, calories: string): Promise<void> {
  await page.goto("/ingredients");
  const searchBox = page.getByRole("textbox", { name: "Search ingredients" });
  await searchBox.fill(ingredientName);
  const row = page.getByTestId("ingredient-row").filter({ hasText: ingredientName }).first();
  await expect(row).toBeVisible();
  const editHref = await row.getByRole("link").first().getAttribute("href");
  await page.goto(editHref!);
  await page.getByRole("spinbutton", { name: "Calories" }).fill(calories);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL("/ingredients");
}

async function openAddPantryDialog(page: Page): Promise<Locator> {
  const headerTrigger = page.getByRole("button", { name: "Add pantry item", exact: true });
  const emptyStateTrigger = page.getByRole("button", { name: "Add your first pantry item" });

  if (await headerTrigger.isVisible().catch(() => false)) {
    await headerTrigger.click();
  } else {
    await emptyStateTrigger.click();
  }

  const dialog = page.getByRole("dialog", { name: "Add pantry item" });
  await expect(dialog).toBeVisible();
  return dialog;
}

function pantryRowFor(page: Page, ingredientName: string): Locator {
  return page.getByTestId("pantry-row").filter({ hasText: ingredientName });
}

async function stockPantry(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  await page.goto("/pantry");
  const dialog = await openAddPantryDialog(page);

  const combobox = page.getByRole("combobox", { name: "Ingredient" });
  await combobox.click();
  await combobox.fill(ingredientName);
  await page.getByRole("option", { name: ingredientName, exact: true }).click();

  await dialog.getByLabel("Quantity").fill(quantity);
  await page.getByRole("combobox", { name: "Unit" }).click();
  await page.getByRole("option", { name: unit, exact: true }).click();

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(pantryRowFor(page, ingredientName)).toHaveCount(1);
}

async function editPantryQuantity(page: Page, ingredientName: string, newQuantity: string): Promise<void> {
  await page.goto("/pantry");
  const row = pantryRowFor(page, ingredientName);
  await row.getByRole("button", { name: "Edit" }).click();

  const dialog = page.getByRole("dialog", { name: "Edit pantry item" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Quantity").fill(newQuantity);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();
}

async function removePantryItem(page: Page, ingredientName: string): Promise<void> {
  await page.goto("/pantry");
  const row = pantryRowFor(page, ingredientName);
  await row.getByRole("button", { name: "Remove" }).click();

  const confirmDialog = page.getByRole("dialog", { name: /remove/i });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Confirm remove" }).click();
  await expect(confirmDialog).not.toBeVisible();
}

/** Exact-match mention insertion (unlike other specs' substring `hasText`
 * filter): needed here because FR-24's own fixture deliberately uses an
 * ingredient named "onion" alongside seeded entries whose names CONTAIN
 * "onion" as a substring (e.g. "Onion, yellow, medium") — a plain
 * substring filter would ambiguously match both. */
async function insertMentionExact(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.pressSequentially(`@${ingredientName.slice(0, 6)}`);

  const option = page
    .getByTestId("mention-option")
    .filter({ hasText: new RegExp(`^${escapeRegExp(ingredientName)}$`) });
  await expect(option.first()).toBeVisible();
  await option.first().click();

  await textarea.pressSequentially(`{${quantity}%${unit}} `);
}

async function createRecipe(
  page: Page,
  name: string,
  lines: Array<{ ingredientName: string; quantity: string; unit: string }>,
  opts: { servings?: string; instructions?: string } = {},
): Promise<string> {
  await page.goto("/recipes/new");
  await expect(page.getByRole("heading", { level: 1, name: "New Recipe" })).toBeVisible();

  await page.getByRole("textbox", { name: "Recipe name" }).fill(name);
  await page.getByRole("spinbutton", { name: "Servings" }).fill(opts.servings ?? "2");

  const textarea = page.getByRole("textbox", { name: "Instructions" });
  await textarea.click();
  for (const line of lines) {
    await insertMentionExact(page, line.ingredientName, line.quantity, line.unit);
  }
  await textarea.pressSequentially(opts.instructions ?? "Combine and serve.");

  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);

  if (!/\/recipes$/.test(new URL(page.url()).pathname)) {
    return new URL(page.url()).pathname;
  }
  const recipeRow = page.getByTestId("recipe-row").filter({ hasText: name });
  await expect(recipeRow.first()).toBeVisible();
  const href = await recipeRow.first().getByRole("link").first().getAttribute("href");
  expect(href).toMatch(/^\/recipes\/\d+$/);
  return href!;
}

function cookableRowFor(page: Page, recipeName: string): Locator {
  return page.getByTestId("cookable-now-section").getByTestId("cookable-recipe-row").filter({ hasText: recipeName });
}

function nearMatchRowFor(page: Page, recipeName: string): Locator {
  return page.getByTestId("near-match-section").getByTestId("near-match-recipe-row").filter({ hasText: recipeName });
}

// ---------------------------------------------------------------------------
// AC1 / FR-29 — the first-run sweep. Must run FIRST, before any other test
// in this serial file writes a single row.
// ---------------------------------------------------------------------------

test("AC1/FR-29: fresh install — Pantry, Recipes render empty states with CTAs; Ingredients shows the seeded (non-empty) catalog", async ({
  page,
}) => {
  const pantryResponse = await page.goto("/pantry");
  expect(pantryResponse?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "Pantry", exact: true })).toBeVisible();
  await expect(page.getByTestId("empty-state")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add your first pantry item" })).toBeVisible();
  await expect(page.getByTestId("pantry-row")).toHaveCount(0);

  const recipesResponse = await page.goto("/recipes");
  expect(recipesResponse?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "Recipes", exact: true })).toBeVisible();
  await expect(page.getByTestId("empty-state")).toBeVisible();
  const addRecipeCta = page.getByRole("link", { name: "Add your first recipe" });
  await expect(addRecipeCta).toBeVisible();
  await expect(addRecipeCta).toHaveAttribute("href", "/recipes/new");
  await expect(page.getByTestId("recipe-row")).toHaveCount(0);

  const ingredientsResponse = await page.goto("/ingredients");
  expect(ingredientsResponse?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "Ingredients", exact: true })).toBeVisible();
  // FR-29's carve-out: the ingredient catalog is SEEDED at boot (S-204),
  // so this route is never empty on a fresh install, unlike Pantry/Recipes.
  const ingredientRows = page.getByTestId("ingredient-row");
  expect(await ingredientRows.count()).toBeGreaterThanOrEqual(300);
});

test("AC1/FR-29: fresh install — What Can I Cook renders without error and its Cookable Now / Near Match sections are both empty", async ({
  page,
}) => {
  const response = await page.goto("/what-can-i-cook");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: "What Can I Cook" })).toBeVisible();

  await expect(page.getByTestId("cookable-now-section")).toBeVisible();
  await expect(page.getByTestId("cookable-recipe-row")).toHaveCount(0);
  await expect(page.getByTestId("near-match-section")).toBeVisible();
  await expect(page.getByTestId("near-match-recipe-row")).toHaveCount(0);
  await expect(page.getByTestId("missing-more-count")).toHaveText("0");
});

// ---------------------------------------------------------------------------
// UJ-1 — managing the pantry: add, edit quantity, remove.
// ---------------------------------------------------------------------------

test("UJ-1: pantry management — add an item, edit its quantity after use, then remove it once fully used", async ({
  page,
}) => {
  await createCustomIngredient(page, { name: "Journey Bread Flour", calories: "364", protein: "10", carbs: "76", fat: "1" });

  await stockPantry(page, "Journey Bread Flour", "2", "kg");
  await expect(pantryRowFor(page, "Journey Bread Flour")).toContainText(/2\s*kg/i);

  // "used some" — edit the quantity down.
  await editPantryQuantity(page, "Journey Bread Flour", "0.5");
  await expect(pantryRowFor(page, "Journey Bread Flour")).toContainText(/0\.5\s*kg/i);

  // "fully used" — remove it.
  await removePantryItem(page, "Journey Bread Flour");
  await expect(pantryRowFor(page, "Journey Bread Flour")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// UJ-2 / UJ-4 — creating a custom recipe (with a freshly-created custom
// ingredient) and immediately seeing its computed nutrition, including a
// flagged incomplete (never-silently-zero) optional value.
// ---------------------------------------------------------------------------

test("UJ-2/UJ-4: authoring a recipe with a newly-created custom ingredient, then immediately viewing its computed nutrition with a flagged incomplete value", async ({
  page,
}) => {
  // "doesn't find what they need" -> creates it, per UJ-2/UJ-5's own
  // wording — this codebase's realized flow for that is: create the
  // ingredient via /ingredients/new (S-302), then find it in the recipe
  // editor's catalog search (S-401) when authoring the recipe, exactly as
  // every other ingredient-then-recipe fixture in this repo already does
  // (e.g. tests/e2e/what-can-i-cook.spec.ts's own setup). Deliberately
  // left WITHOUT a `sugar` value, so the recipe's total/per-serving sugar
  // must be flagged N/A rather than silently rendered as 0 (FR-19).
  await createCustomIngredient(page, {
    name: "Journey Oat Clusters",
    calories: "150",
    protein: "4",
    carbs: "20",
    fat: "6",
    // sugar intentionally omitted (stays null/unresolved for this ingredient).
  });

  const recipeHref = await createRecipe(
    page,
    "Journey Granola",
    [{ ingredientName: "Journey Oat Clusters", quantity: "200", unit: "g" }],
    { servings: "4", instructions: "Toast and cool." },
  );

  await page.goto(recipeHref);
  await expect(page.getByRole("heading", { level: 1, name: "Journey Granola" })).toBeVisible();

  // UJ-4: totals AND per-serving are both present immediately, no
  // separate save/reload step.
  await expect(page.getByTestId("nutrition-total-calories")).toHaveText("300 kcal");
  await expect(page.getByTestId("nutrition-per-serving-calories")).toHaveText("75 kcal");

  // FR-19: the missing optional field is flagged N/A, never a silent 0.
  await expect(page.getByTestId("nutrition-total-sugar")).toHaveText("N/A");
  await expect(page.getByTestId("nutrition-per-serving-sugar")).toHaveText("N/A");
});

// ---------------------------------------------------------------------------
// UJ-5 — overriding a seeded ingredient's nutrition and seeing it
// propagate everywhere it's used, without disturbing the seed record's
// identity (the SAME ingredient, still SEEDED, just overridden).
// ---------------------------------------------------------------------------

test("UJ-5: overriding a seeded ingredient's nutrition propagates to a recipe that uses it, with no separate cache-invalidation step", async ({
  page,
}) => {
  const SEEDED_INGREDIENT = "Banana, medium";

  const recipeHref = await createRecipe(
    page,
    "Journey Banana Smoothie",
    [{ ingredientName: SEEDED_INGREDIENT, quantity: "1", unit: "each" }],
    { servings: "1" },
  );

  await page.goto(recipeHref);
  const beforeText = await page.getByTestId("nutrition-total-calories").innerText();
  const beforeCalories = Number(beforeText.replace(/[^0-9.]/g, ""));
  expect(Number.isFinite(beforeCalories)).toBe(true);

  // Override the seeded ingredient's calories to a deliberately distinctive value.
  await overrideSeededCalories(page, SEEDED_INGREDIENT, "999");

  // Same ingredient still exists, is still findable/usable — this was an
  // override, not a delete-and-recreate (FR-3's "without disturbing the
  // underlying seed record's identity").
  await page.goto("/ingredients");
  await page.getByRole("textbox", { name: "Search ingredients" }).fill(SEEDED_INGREDIENT);
  const row = page.getByTestId("ingredient-row").filter({ hasText: SEEDED_INGREDIENT }).first();
  await expect(row).toBeVisible();
  await expect(row.getByTestId("source-badge")).toHaveText("SEEDED");

  // Revisit the SAME recipe detail — no manual invalidation step (ADR-011).
  await page.goto(recipeHref);
  await expect(page.getByTestId("nutrition-total-calories")).toHaveText("999 kcal");
});

// ---------------------------------------------------------------------------
// UJ-3 — What Can I Cook: cookable now, near-match with an exact
// shortfall, and (FR-20) a recipe dropping off Cookable Now the instant
// simulated pantry depletion takes a requirement below threshold.
// ---------------------------------------------------------------------------

const JOURNEY_WCIC_A = "Journey WCIC Ingredient A";
const JOURNEY_WCIC_B = "Journey WCIC Ingredient B";
const JOURNEY_COOKABLE_RECIPE = "Journey Cookable Stew";
const JOURNEY_NEAR_MATCH_RECIPE = "Journey Near Match Stew";

test("UJ-3: What Can I Cook shows a fully-stocked recipe as Cookable Now and a partially-stocked one as Near Match with its exact shortfall", async ({
  page,
}) => {
  await createCustomIngredient(page, { name: JOURNEY_WCIC_A });
  await createCustomIngredient(page, { name: JOURNEY_WCIC_B });

  await stockPantry(page, JOURNEY_WCIC_A, "500", "g");
  await stockPantry(page, JOURNEY_WCIC_B, "100", "g");

  await createRecipe(page, JOURNEY_COOKABLE_RECIPE, [{ ingredientName: JOURNEY_WCIC_A, quantity: "400", unit: "g" }]);
  await createRecipe(page, JOURNEY_NEAR_MATCH_RECIPE, [
    { ingredientName: JOURNEY_WCIC_B, quantity: "300", unit: "g" },
  ]);

  await page.goto("/what-can-i-cook");

  await expect(cookableRowFor(page, JOURNEY_COOKABLE_RECIPE)).toBeVisible();
  await expect(nearMatchRowFor(page, JOURNEY_COOKABLE_RECIPE)).toHaveCount(0);

  const nearMatchRow = nearMatchRowFor(page, JOURNEY_NEAR_MATCH_RECIPE);
  await expect(nearMatchRow).toBeVisible();
  await expect(cookableRowFor(page, JOURNEY_NEAR_MATCH_RECIPE)).toHaveCount(0);
  await expect(nearMatchRow.getByTestId("unsatisfied-line").first()).toContainText(
    new RegExp(`need\\s+200\\s*g\\s+more\\s+${JOURNEY_WCIC_B}`, "i"),
  );
});

test("FR-20: depleting the pantry (editing quantity down) drops a recipe from Cookable Now straight to Near Match", async ({
  page,
}) => {
  // Continuation of the previous test's fixture (same isolated DB, serial
  // ordering): Journey WCIC Ingredient A has 500 g in the pantry and
  // Journey Cookable Stew requires 400 g of it — currently Cookable Now.
  await page.goto("/what-can-i-cook");
  await expect(cookableRowFor(page, JOURNEY_COOKABLE_RECIPE)).toBeVisible();

  // Simulate depletion: "used most of it" — down to 100 g, below the
  // recipe's 400 g requirement.
  await editPantryQuantity(page, JOURNEY_WCIC_A, "100");

  await page.goto("/what-can-i-cook");
  await expect(cookableRowFor(page, JOURNEY_COOKABLE_RECIPE)).toHaveCount(0);
  const nearMatchRow = nearMatchRowFor(page, JOURNEY_COOKABLE_RECIPE);
  await expect(nearMatchRow).toBeVisible();
  await expect(nearMatchRow.getByTestId("unsatisfied-line").first()).toContainText(
    new RegExp(`need\\s+300\\s*g\\s+more\\s+${JOURNEY_WCIC_A}`, "i"),
  );
});

// ---------------------------------------------------------------------------
// FR-24 — matching is ID-only: two distinct catalog entries that merely
// SHARE a name substring ("onion") never satisfy one another.
// ---------------------------------------------------------------------------

test("FR-24: a pantry item stocking the SEEDED 'Onion, yellow, medium' never satisfies a recipe line requiring a distinct CUSTOM ingredient literally named 'onion'", async ({
  page,
}) => {
  const SEEDED_ONION = "Onion, yellow, medium";
  const CUSTOM_ONION = "onion";
  const RECIPE_NAME = "Journey FR-24 Onion Soup";

  await createCustomIngredient(page, { name: CUSTOM_ONION });

  // Stock the pantry with the SEEDED onion, plentifully — never the custom one.
  await stockPantry(page, SEEDED_ONION, "1", "kg");

  // The recipe requires the CUSTOM "onion" — a distinct catalog entry —
  // which the pantry never stocks at all.
  await createRecipe(page, RECIPE_NAME, [{ ingredientName: CUSTOM_ONION, quantity: "50", unit: "g" }]);

  await page.goto("/what-can-i-cook");

  // Never cookable — ID-only matching means the plentiful seeded onion
  // does not, and must not, satisfy the custom "onion" line.
  await expect(cookableRowFor(page, RECIPE_NAME)).toHaveCount(0);

  // It must show up somewhere as unsatisfied (near-match or the
  // summarized missing-more tail, depending on the active threshold) —
  // never silently vanish from the page.
  const nearMatchRow = nearMatchRowFor(page, RECIPE_NAME);
  const isInNearMatch = await nearMatchRow.count();
  if (isInNearMatch > 0) {
    await expect(nearMatchRow.getByTestId("unsatisfied-line").first()).toContainText(
      new RegExp(`need\\s+50\\s*g\\s+more\\s+${CUSTOM_ONION}`, "i"),
    );
  } else {
    // Excluded from Near Match only because it's counted in the
    // missing-more tail at the current threshold — still never Cookable
    // and never silently dropped from the page entirely.
    const missingMoreCount = Number((await page.getByTestId("missing-more-count").innerText()).trim());
    expect(missingMoreCount).toBeGreaterThanOrEqual(1);
  }
});

// ---------------------------------------------------------------------------
// AC1/FR-29 — a known-red assertion, deliberately placed LAST.
//
// `test.describe.configure({ mode: "serial" })` above means every test in
// this file shares one worker/DB and Playwright skips the REMAINDER of the
// file the moment one test fails. The rest of this suite (UJ-1..UJ-5,
// FR-20, FR-24) is real, currently-GREEN regression coverage that must not
// be hidden behind this one known defect — so it runs last, on purpose,
// once everything else has already been exercised and verified passing.
// ---------------------------------------------------------------------------

test("AC1/FR-29 (regression pin): What Can I Cook never renders an actual call-to-action control, in any state — not on the pristine first-run DB, and not here either", async ({
  page,
}) => {
  await page.goto("/what-can-i-cook");

  // FR-29's acceptance criterion is explicit that a first-run "What Can I
  // Cook" (no recipes and/or no pantry items) must show "a defined
  // empty-state message with a clear call to action" — the SAME bar this
  // story's own tests/e2e/shell.spec.ts already holds Pantry/Recipes to
  // (a `data-testid="empty-state"` wrapping a real link/button, not just
  // descriptive prose). The page's markup never renders a real CTA
  // control in ANY state — only conditional paragraph text ("Nothing is
  // fully stocked yet — check Near Match below, or add pantry items." /
  // "No near matches right now.") inside each of the Cookable Now / Near
  // Match sections, independently of the OTHER section's content — so
  // this defect is provable here just as validly as on a pristine DB.
  //
  // The genuinely pristine "both sections literally empty" first-run
  // state is what this file's EARLIER `AC1/FR-29: fresh install — What
  // Can I Cook renders without error and its Cookable Now / Near Match
  // sections are both empty` test asserts; THIS test is placed last,
  // deliberately, so its known failure (below) never cascades into
  // skipping the rest of this serial suite's real, currently-green UJ-1
  // through FR-24 coverage (see the block comment above this test).
  const cta = page
    .getByRole("link", { name: /add (your first )?(pantry|recipe)/i })
    .or(page.getByRole("button", { name: /add (your first )?(pantry|recipe)/i }));

  await expect(
    cta.first(),
    'FR-29 requires a clear call-to-action on the first-run "What Can I Cook" view; only descriptive text is currently rendered, with no actionable link/button to add a pantry item or create a recipe',
  ).toBeVisible();
});
