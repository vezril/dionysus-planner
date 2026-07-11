import { expect, test, type Page } from "@playwright/test";

/**
 * S-405 Recipe tags & tag filtering — end-to-end coverage
 * (docs/stories/S-405-recipe-tags.md AC1-AC4, prd.md FR-16).
 *
 * Readiness-gate note (per the story fix): the tag-AND intersection
 * MATCHING logic is unit-tested in isolation at
 * tests/unit/domain/listFilters.test.ts against the pure `filterByTagsAll`
 * predicate. This suite is deliberately "thin wiring" on top of that — it
 * does not re-derive intersection edge cases; it proves the recipe editor
 * actually has a tag input, saved tags actually display on the detail page
 * and the list, and the `/recipes` list actually has clickable tag-filter
 * chips wired to the already-unit-tested predicate.
 *
 * None of the elements below exist yet: the S-401 editor
 * (`app/recipes/_components/recipe-editor.tsx`) has no tag input, the
 * detail page (`app/recipes/[id]/page.tsx`) renders no tags, and the list
 * (`app/recipes/_components/recipe-catalog.tsx`) has no tag-filter UI —
 * every test below is intentionally RED (missing elements/timeouts) until
 * the implementer builds the tag input, tag display, and tag-filter
 * control per this file's pinned contract.
 *
 * Test-isolation note (same pattern as tests/e2e/recipe-create.spec.ts and
 * tests/e2e/recipe-list.spec.ts): the e2e DB is persistent and shared
 * across this whole `webServer` run, so every fixture recipe NAME and every
 * fixture TAG below is suffixed with a run-unique token — assertions only
 * ever check for THIS run's own rows/chips (by name/text), never a total
 * count, and tag-filter-chip lookups are always scoped with `.filter({
 * hasText })` so pre-existing tags left behind by earlier runs never
 * interfere.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Recipe editor (`/recipes/new`, `/recipes/<id>/edit` — shared component):
 *   - `getByRole("textbox", { name: "Tags" })` — a single free-text input
 *     for entering one tag at a time.
 *   - Pressing Enter while the Tags input is focused and non-empty commits
 *     its (trimmed) current value as a tag CHIP and clears the input. Each
 *     committed chip renders as `data-testid="recipe-tag-chip"`, containing
 *     the tag's text, with `getByRole("button", { name: \`Remove tag
 *     ${tag}\` })` inside it that removes just that chip when clicked.
 *   - Saving the recipe (existing "Save recipe" button) submits every
 *     currently-committed chip as that recipe's tags.
 *
 * Recipe detail page (`/recipes/<id>`, existing S-403 page):
 *   - `data-testid="recipe-tags"` — container present when the recipe has
 *     >= 1 tag. Within it, one `data-testid="recipe-tag"` per tag, each
 *     containing that tag's text.
 *
 * Recipe list (`/recipes`, existing S-404 search island):
 *   - Each `data-testid="recipe-row"` ALSO contains one
 *     `data-testid="recipe-row-tag"` per tag that recipe carries (AC1:
 *     tags "display on the recipe's... list entries").
 *   - `data-testid="tag-filter"` — a container rendering one
 *     `data-testid="tag-filter-chip"` per DISTINCT tag across the
 *     currently-loaded recipe list, each chip's text equal to that tag.
 *   - Clicking an unselected tag-filter chip selects it (`aria-pressed`
 *     becomes `"true"`); clicking an already-selected chip deselects it
 *     (`aria-pressed` back to `"false"`).
 *   - With >= 1 tag-filter chip selected, only `recipe-row`s carrying
 *     EVERY selected tag remain visible (AND-intersection, delegating to
 *     `domain/listFilters.ts#filterByTagsAll` — AC2) — this composes with
 *     the existing "Search recipes" name-filter box (both constraints
 *     apply together, FR-25 + FR-16).
 *   - Deselecting every selected chip (clicking each again) restores every
 *     previously-visible row.
 * ===========================================================================
 *
 * Scoped to chromium only, mirroring tests/e2e/recipe-list.spec.ts's own
 * story-level e2e task split.
 */

async function createRecipeWithTags(page: Page, name: string, tags: string[]): Promise<void> {
  await page.goto("/recipes/new");
  await expect(page.getByRole("heading", { level: 1, name: "New Recipe" })).toBeVisible();

  await page.getByRole("textbox", { name: "Recipe name" }).fill(name);
  await page.getByRole("spinbutton", { name: "Servings" }).fill("2");
  await page.getByRole("textbox", { name: "Instructions" }).fill("n/a");

  const addButton = page.getByRole("button", { name: "Add ingredient line" });
  while ((await page.getByTestId("recipe-line-row").count()) < 1) {
    await addButton.click();
  }
  const row = page.getByTestId("recipe-line-row").first();

  // Distinctive, single-match seeded ingredient name (data/seed/seed-data.json,
  // S-204) — same fixture used by tests/e2e/recipe-create.spec.ts /
  // tests/e2e/recipe-list.spec.ts.
  const ingredientInput = row.getByRole("textbox", { name: "Ingredient" });
  await ingredientInput.fill("Garlic, 1 clove");
  const option = row.getByTestId("recipe-ingredient-option").filter({ hasText: "Garlic, 1 clove" });
  await expect(option.first()).toBeVisible();
  await option.first().click();

  await row.getByRole("spinbutton", { name: "Quantity" }).fill("1");
  await row.getByRole("combobox", { name: "Unit" }).click();
  await page.getByRole("option", { name: "g", exact: true }).click();

  const tagsInput = page.getByRole("textbox", { name: "Tags" });
  for (const tag of tags) {
    await tagsInput.fill(tag);
    await tagsInput.press("Enter");
    await expect(page.getByTestId("recipe-tag-chip").filter({ hasText: tag })).toBeVisible();
  }

  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes(\/\d+)?$/);
}

test.describe("S-405 recipe tags", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "functional ACs verified once on chromium");
  });

  test("the recipe editor has a tag input named \"Tags\"", async ({ page }) => {
    await page.goto("/recipes/new");
    await expect(page.getByRole("heading", { level: 1, name: "New Recipe" })).toBeVisible();

    await expect(page.getByRole("textbox", { name: "Tags" })).toBeVisible();
  });

  test("AC1: creating a recipe with two tags shows both on the detail page", async ({ page }) => {
    const runId = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const recipeName = `E2E Tagged Recipe ${runId}`;
    const tagA = `quick-${runId}`;
    const tagB = `vegetarian-${runId}`;

    await createRecipeWithTags(page, recipeName, [tagA, tagB]);

    if (!/\/recipes\/\d+$/.test(new URL(page.url()).pathname)) {
      await page.goto("/recipes");
      const recipeRow = page.getByTestId("recipe-row").filter({ hasText: recipeName });
      await expect(recipeRow.first()).toBeVisible();
      await recipeRow.first().getByRole("link").first().click();
    }

    await expect(page.getByRole("heading", { level: 1, name: recipeName })).toBeVisible();
    const tagsContainer = page.getByTestId("recipe-tags");
    await expect(tagsContainer).toBeVisible();
    await expect(tagsContainer.getByTestId("recipe-tag").filter({ hasText: tagA })).toBeVisible();
    await expect(tagsContainer.getByTestId("recipe-tag").filter({ hasText: tagB })).toBeVisible();
  });

  test("AC1: the recipe list row for a tagged recipe also shows its tags", async ({ page }) => {
    const runId = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const recipeName = `E2E List Tag Recipe ${runId}`;
    const tag = `one-pot-${runId}`;

    await createRecipeWithTags(page, recipeName, [tag]);
    await page.goto("/recipes");

    const recipeRow = page.getByTestId("recipe-row").filter({ hasText: recipeName });
    await expect(recipeRow.first()).toBeVisible();
    await expect(recipeRow.first().getByTestId("recipe-row-tag").filter({ hasText: tag })).toBeVisible();
  });

  test("AC2: the recipe list has a tag filter, and selecting two tags narrows the list to recipes carrying BOTH (AND-intersection)", async ({
    page,
  }) => {
    const runId = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const quickTag = `quick-${runId}`;
    const vegTag = `vegetarian-${runId}`;
    const bothName = `E2E Both Tags ${runId}`;
    const quickOnlyName = `E2E Quick Only ${runId}`;
    const vegOnlyName = `E2E Veg Only ${runId}`;

    await createRecipeWithTags(page, bothName, [quickTag, vegTag]);
    await createRecipeWithTags(page, quickOnlyName, [quickTag]);
    await createRecipeWithTags(page, vegOnlyName, [vegTag]);

    await page.goto("/recipes");

    const bothRow = page.getByTestId("recipe-row").filter({ hasText: bothName });
    const quickOnlyRow = page.getByTestId("recipe-row").filter({ hasText: quickOnlyName });
    const vegOnlyRow = page.getByTestId("recipe-row").filter({ hasText: vegOnlyName });
    await expect(bothRow).toHaveCount(1);
    await expect(quickOnlyRow).toHaveCount(1);
    await expect(vegOnlyRow).toHaveCount(1);

    const tagFilter = page.getByTestId("tag-filter");
    await expect(tagFilter).toBeVisible();

    const quickChip = tagFilter.getByTestId("tag-filter-chip").filter({ hasText: quickTag });
    const vegChip = tagFilter.getByTestId("tag-filter-chip").filter({ hasText: vegTag });
    await expect(quickChip).toBeVisible();
    await expect(vegChip).toBeVisible();

    await quickChip.click();
    await expect(quickChip).toHaveAttribute("aria-pressed", "true");
    await vegChip.click();
    await expect(vegChip).toHaveAttribute("aria-pressed", "true");

    await expect(async () => {
      await expect(bothRow).toHaveCount(1);
      await expect(quickOnlyRow).toHaveCount(0);
      await expect(vegOnlyRow).toHaveCount(0);
    }).toPass({ timeout: 300 });

    // Clearing (deselecting both selected chips) restores every row.
    await quickChip.click();
    await vegChip.click();
    await expect(quickChip).toHaveAttribute("aria-pressed", "false");
    await expect(vegChip).toHaveAttribute("aria-pressed", "false");

    await expect(async () => {
      await expect(bothRow).toHaveCount(1);
      await expect(quickOnlyRow).toHaveCount(1);
      await expect(vegOnlyRow).toHaveCount(1);
    }).toPass({ timeout: 300 });
  });

  test("AC2: tag filter composes with the name search — both constraints apply together", async ({ page }) => {
    const runId = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const sharedTag = `quick-${runId}`;
    const matchingName = `Zzchicken${runId} Stir-Fry`;
    const otherName = `Zzpasta${runId} Primavera`;

    await createRecipeWithTags(page, matchingName, [sharedTag]);
    await createRecipeWithTags(page, otherName, [sharedTag]);

    await page.goto("/recipes");

    const matchingRow = page.getByTestId("recipe-row").filter({ hasText: matchingName });
    const otherRow = page.getByTestId("recipe-row").filter({ hasText: otherName });
    await expect(matchingRow).toHaveCount(1);
    await expect(otherRow).toHaveCount(1);

    const tagChip = page.getByTestId("tag-filter").getByTestId("tag-filter-chip").filter({ hasText: sharedTag });
    await tagChip.click();
    await expect(tagChip).toHaveAttribute("aria-pressed", "true");

    // Both recipes carry the tag, so the tag filter alone doesn't narrow
    // between them — only the ADDED name search does.
    await expect(async () => {
      await expect(matchingRow).toHaveCount(1);
      await expect(otherRow).toHaveCount(1);
    }).toPass({ timeout: 300 });

    await page.getByRole("textbox", { name: "Search recipes" }).fill(`ZZCHICKEN${runId}`);

    await expect(async () => {
      await expect(matchingRow).toHaveCount(1);
      await expect(otherRow).toHaveCount(0);
    }).toPass({ timeout: 300 });
  });
});
