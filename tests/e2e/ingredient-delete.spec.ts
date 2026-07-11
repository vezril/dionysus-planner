import { expect, test, type Page } from "@playwright/test";

/**
 * S-303 Ingredient deletion rules — end-to-end coverage
 * (docs/stories/S-303-ingredient-delete-rules.md AC-1 through AC-3, FR-4's
 * UI half).
 *
 * Fresh-install / shared-DB context: same persistent server + SQLite file
 * as every other e2e spec (architecture.md §6 Flow A boots migrate-then-
 * seed once; `pnpm start` is reused across the whole run per
 * playwright.config.ts). Every ingredient created below uses a
 * `Date.now()`-suffixed unique name (S-302's own e2e pattern) so this
 * file's mutations never collide with another spec file's fixtures or a
 * parallel worker.
 *
 * Neither `app/actions/ingredient-actions.ts`'s `deleteIngredient` nor any
 * delete affordance exists on `/ingredients/[id]/edit` yet (S-302
 * deliberately omitted it — see tests/e2e/ingredient-edit.spec.ts's own
 * "no delete control" assertion for a SEEDED row) — every test below is
 * intentionally RED until the implementer builds both.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Edit page (`/ingredients/[id]/edit`) delete affordance:
 *   - A `CUSTOM` ingredient's edit page renders exactly one
 *     `data-testid="delete-ingredient"` element that is ALSO reachable as
 *     `getByRole("button", { name: /delete/i })` (e.g. "Delete
 *     ingredient") — this dual-selector shape matches what
 *     tests/e2e/ingredient-edit.spec.ts already pins as ABSENT for SEEDED
 *     rows, so the two suites assert the same seam from both sides.
 *   - A `SEEDED` ingredient's edit page renders NEITHER of those (already
 *     pinned by ingredient-edit.spec.ts; re-asserted here as this story's
 *     own AC-3 UI coverage).
 *   - Clicking the delete control opens a confirmation dialog:
 *     `getByRole("dialog", { name: /delete/i })`, containing
 *     `getByRole("button", { name: "Confirm delete", exact: true })` and
 *     `getByRole("button", { name: "Cancel", exact: true })`. Clicking
 *     "Cancel" closes the dialog without navigating or deleting anything.
 *   - Clicking "Confirm delete" invokes `deleteIngredient`:
 *     - Success (unreferenced CUSTOM): the app navigates to `/ingredients`
 *       and the deleted ingredient's row no longer appears in the catalog
 *       (by name, via the S-301 search box).
 *     - Blocked (referenced CUSTOM): the app stays on the edit page (no
 *       navigation) and renders a blocking message visible via
 *       `getByText` matching /cannot .*delete|blocked|referenced/i AND
 *       mentioning the specific reference (a referencing recipe's name,
 *       and/or text matching /pantry/i for a pantry reference) — FR-4's
 *       friendly listing, end to end. The ingredient's row still exists
 *       in the catalog afterward.
 * ===========================================================================
 */

test.describe("S-303 ingredient deletion rules", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "delete-rule ACs verified once on chromium");
  });

  async function createCustomIngredient(page: Page, name: string): Promise<void> {
    await page.goto("/ingredients/new");
    await page.getByRole("textbox", { name: "Name" }).fill(name);
    await page.getByRole("combobox", { name: "Unit class" }).click();
    await page.getByRole("option", { name: "Mass", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Calories" }).fill("100");
    await page.getByRole("spinbutton", { name: "Protein" }).fill("2");
    await page.getByRole("spinbutton", { name: "Carbs" }).fill("5");
    await page.getByRole("spinbutton", { name: "Fat" }).fill("1");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/ingredients\/?$/);
  }

  async function goToEditPageFor(page: Page, name: string): Promise<void> {
    await page.goto("/ingredients");
    const searchBox = page.getByRole("textbox", { name: "Search ingredients" });
    await searchBox.fill(name);
    const row = page.getByTestId("ingredient-row").filter({ hasText: name });
    await expect(row).toHaveCount(1);
    await row.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/ingredients\/\d+\/edit$/);
  }

  test("AC-1: an unreferenced CUSTOM ingredient's edit page shows a delete control, and confirming it removes the ingredient from the catalog", async ({
    page,
  }) => {
    const uniqueName = `E2E Deletable Custom Ingredient ${Date.now()}`;
    await createCustomIngredient(page, uniqueName);
    await goToEditPageFor(page, uniqueName);

    const deleteButton = page.getByTestId("delete-ingredient");
    await expect(deleteButton).toBeVisible();
    await expect(page.getByRole("button", { name: /delete/i })).toBeVisible();

    await deleteButton.click();

    const confirmDialog = page.getByRole("dialog", { name: /delete/i });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Confirm delete", exact: true }).click();

    await expect(page).toHaveURL(/\/ingredients\/?$/);

    const searchBox = page.getByRole("textbox", { name: "Search ingredients" });
    await searchBox.fill(uniqueName);
    await expect(page.getByTestId("ingredient-row")).toHaveCount(0);
  });

  test("AC-1: cancelling the confirmation dialog deletes nothing and leaves the ingredient in the catalog", async ({
    page,
  }) => {
    const uniqueName = `E2E Cancelled Delete Ingredient ${Date.now()}`;
    await createCustomIngredient(page, uniqueName);
    await goToEditPageFor(page, uniqueName);

    await page.getByTestId("delete-ingredient").click();
    const confirmDialog = page.getByRole("dialog", { name: /delete/i });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirmDialog).not.toBeVisible();

    // Still on the edit page — cancelling never navigates or deletes.
    await expect(page).toHaveURL(/\/ingredients\/\d+\/edit$/);

    await page.goto("/ingredients");
    const searchBox = page.getByRole("textbox", { name: "Search ingredients" });
    await searchBox.fill(uniqueName);
    await expect(page.getByTestId("ingredient-row").filter({ hasText: uniqueName })).toHaveCount(1);
  });

  test("AC-3: a SEEDED ingredient's edit page shows no delete control", async ({ page }) => {
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

    await expect(page.getByTestId("delete-ingredient")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
  });

  test("AC-2: deleting a CUSTOM ingredient that's in the pantry is blocked with a message mentioning pantry, and the row survives", async ({
    page,
  }) => {
    const uniqueName = `E2E Pantry Referenced Ingredient ${Date.now()}`;
    await createCustomIngredient(page, uniqueName);

    // Add the freshly created ingredient to the pantry via the UI
    // (S-304's already-green add flow) so it becomes referenced.
    await page.goto("/pantry");
    const addTrigger = page
      .getByRole("button", { name: "Add pantry item", exact: true })
      .or(page.getByRole("button", { name: "Add your first pantry item" }));
    await addTrigger.first().click();
    const addDialog = page.getByRole("dialog", { name: "Add pantry item" });
    await expect(addDialog).toBeVisible();

    const ingredientCombobox = page.getByRole("combobox", { name: "Ingredient" });
    await ingredientCombobox.click();
    await ingredientCombobox.fill(uniqueName);
    await page.getByRole("option", { name: uniqueName, exact: true }).click();
    await addDialog.getByLabel("Quantity").fill("100");
    await page.getByRole("combobox", { name: "Unit" }).click();
    await page.getByRole("option", { name: "g", exact: true }).click();
    await addDialog.getByRole("button", { name: "Save" }).click();
    await expect(addDialog).not.toBeVisible();

    await goToEditPageFor(page, uniqueName);

    await page.getByTestId("delete-ingredient").click();
    const confirmDialog = page.getByRole("dialog", { name: /delete/i });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Confirm delete", exact: true }).click();

    // Blocked: stays on the edit page, shows a friendly message
    // mentioning the pantry reference — never a raw FK error, never a
    // silent navigate-away.
    await expect(page).toHaveURL(/\/ingredients\/\d+\/edit$/);
    // Scoped to the error paragraph: the page-wide /pantry/i locator collided
    // with the nav's "Pantry" link (strict-mode violation) whenever the
    // message correctly mentioned the pantry.
    const blockError = page.getByTestId("delete-ingredient-error");
    await expect(blockError).toBeVisible();
    await expect(blockError).toHaveText(/cannot .*delete|blocked|referenced/i);
    await expect(blockError).toHaveText(/pantry/i);

    await page.goto("/ingredients");
    const searchBox = page.getByRole("textbox", { name: "Search ingredients" });
    await searchBox.fill(uniqueName);
    await expect(page.getByTestId("ingredient-row").filter({ hasText: uniqueName })).toHaveCount(1);
  });
});
