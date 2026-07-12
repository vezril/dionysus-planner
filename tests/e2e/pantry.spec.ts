import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * S-304 Pantry view & add item (upsert with increment/replace) —
 * acceptance criteria coverage (docs/stories/S-304-pantry-add-upsert.md).
 *
 * Fresh-install context: e2e drives a locally-built `next start` instance
 * (architecture.md §3 ADR-007) whose `instrumentation.ts` migrate-then-
 * seed hook loads the 351-row ingredient catalog (S-204) before any
 * request is served — but the PANTRY itself starts empty on a fresh
 * install (pantry rows are never seeded). This suite supersedes
 * shell.spec.ts's generic /pantry empty-state coverage the same way
 * tests/e2e/ingredients.spec.ts superseded it for /ingredients — see the
 * comment left in shell.spec.ts. Every pantry-state assertion, INCLUDING
 * the "empty" one, lives here so this one file can control ordering
 * (`test.describe.configure({ mode: "serial" })`) and avoid a race
 * against the single, persistent SQLite file the whole e2e run shares
 * across spec files and parallel workers.
 *
 * `/app/pantry/page.tsx` is still the S-105 placeholder (static h1 +
 * EmptyState, no data fetching, no form) — every test below is
 * intentionally RED until the implementer builds the real RSC list +
 * `_components/PantryItemForm.tsx` client dialog.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Page (`/app/pantry`, RSC list via pantryRepo):
 *   - One `<h1>` "Pantry" (unchanged from S-105).
 *   - Zero pantry rows => `data-testid="empty-state"` container with a
 *     CTA button/link named exactly "Add your first pantry item"
 *     (FR-29's literal example, unchanged from S-105/shell.spec.ts).
 *   - >=1 pantry row => a PERSISTENT `getByRole("button", { name: "Add
 *     pantry item", exact: true })` trigger is ALSO always rendered (so
 *     users can keep adding once the empty-state CTA is gone). Both this
 *     button and the empty-state CTA open the identical add-item dialog.
 *   - Each pantry row carries `data-testid="pantry-row"` and contains:
 *     the ingredient's name, and the display quantity/unit as entered
 *     (e.g. adding "2 lb" leaves text matching /2\s*lb/i in that row —
 *     FR-9's verbatim redisplay, never the canonical grams value).
 *
 * Add-item dialog (`_components/PantryItemForm.tsx`, client, shadcn
 * Dialog per ADR-006, react-hook-form + zod per ADR-005):
 *   - `getByRole("dialog", { name: "Add pantry item" })`.
 *   - Ingredient picker: `getByRole("combobox", { name: "Ingredient" })`
 *     — an ARIA-combobox text input that narrows a listbox of
 *     `getByRole("option")` suggestions as the user types (sourced from
 *     `/api/ingredients?q=`, S-301's already-reusable route). Options are
 *     queried PAGE-scoped, not dialog-scoped, in this suite, because
 *     shadcn's Command/Popover pattern typically portals listbox content
 *     outside the dialog's DOM subtree even though it's visually
 *     contained — a plain DOM-containment query would miss it.
 *   - Quantity: `getByLabel("Quantity")`, numeric input, positive.
 *   - Unit: `getByRole("combobox", { name: "Unit" })` (shadcn Select
 *     trigger) opens a listbox of ALL 11 FR-10 unit keys as
 *     `getByRole("option", { name: <unit-key>, exact: true })` — NOT
 *     scoped down to the selected ingredient's primary class, since FR-6
 *     explicitly permits cross-class entry and every scenario below
 *     depends on reaching a unit outside the ingredient's primary class.
 *   - Submit: `getByRole("button", { name: "Save" })` inside the dialog.
 *   - Success: dialog closes; the row appears/updates per the Page
 *     contract above.
 *   - Duplicate ingredient, no mode chosen yet: submitting does NOT close
 *     the dialog or create a second row. The dialog instead shows text
 *     matching /already .*pantry/i plus two buttons,
 *     `getByRole("button", { name: "Increment" })` and
 *     `getByRole("button", { name: "Replace" })`.
 *     - "Increment" completes using the already-entered quantity/unit
 *       (same-class or cross-class-with-density), then behaves like
 *       Success above.
 *     - If that increment is cross-class with NO density, clicking
 *       "Increment" does NOT close the dialog — it shows an error
 *       message matching /cannot .*convert|no density|unresolved/i while
 *       leaving "Replace" available (never a silent guess, per
 *       architecture.md §4).
 *     - "Replace" (from either the plain choice or after a rejected
 *       increment) always completes as a full overwrite, then behaves
 *       like Success above.
 *   - Invalid input (no ingredient selected and/or non-positive quantity)
 *     blocks the Save client-side: the dialog stays open and visible text
 *     matching /required|select an ingredient|positive/i appears.
 *   - Standard Radix Dialog behavior (no extra work required): pressing
 *     `Escape` closes the dialog.
 *
 * Fixture ingredients used below are real seeded catalog rows
 * (data/seed/seed-data.json, S-204), chosen for stable, non-overlapping
 * substring search results and known density/no-density status:
 *   - "Broccoli, raw"   — MASS, no density   (fresh add + same-class increment)
 *   - "Butter, salted"  — MASS, density 0.955 (cross-class WITH density)
 *   - "Spinach, raw"    — MASS, no density   (cross-class WITHOUT density -> reject)
 * ===========================================================================
 */

async function openAddDialog(page: Page): Promise<Locator> {
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

async function pickIngredient(page: Page, name: string): Promise<void> {
  const combobox = page.getByRole("combobox", { name: "Ingredient" });
  await combobox.click();
  await combobox.fill(name);
  await page.getByRole("option", { name, exact: true }).click();
}

async function selectUnit(page: Page, unit: string): Promise<void> {
  await page.getByRole("combobox", { name: "Unit" }).click();
  await page.getByRole("option", { name: unit, exact: true }).click();
}

async function fillQuantity(dialog: Locator, quantity: string): Promise<void> {
  await dialog.getByLabel("Quantity").fill(quantity);
}

function pantryRowFor(page: Page, ingredientName: string): Locator {
  return page.getByTestId("pantry-row").filter({ hasText: ingredientName });
}

/**
 * The shared e2e DB persists across runs, so fixture rows left by a prior
 * run would turn this suite's clean-add flows into NEEDS_CHOICE upserts
 * (dialog stays open on Increment/Replace instead of closing). Remove any
 * leftovers first so the suite is idempotent across repeated runs.
 */
async function removeLeftoverFixtureRows(page: Page, names: string[]): Promise<void> {
  await page.goto("/pantry");
  for (const name of names) {
    const row = pantryRowFor(page, name);
    if ((await row.count()) > 0) {
      await row.first().getByRole("button", { name: "Remove" }).click();
      const confirm = page.getByRole("dialog", { name: /remove/i });
      await confirm.getByRole("button", { name: "Confirm remove" }).click();
      await expect(row).toHaveCount(0);
    }
  }
}

test.describe("S-304 pantry add + upsert", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await removeLeftoverFixtureRows(page, ["Broccoli, raw", "Butter, salted", "Spinach, raw"]);
    await page.close();
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "detailed pantry ACs verified once on chromium");
  });

  // AC7/FR-29 (empty-pantry state + literal CTA copy) is owned by
  // tests/e2e/journeys.spec.ts, which runs against an isolated fresh DB.
  // Asserting emptiness here was inherently racy: this suite is serial
  // WITHIN the file, but other spec files write pantry rows to the shared
  // persistent .dev-data DB under fullyParallel, so "the pantry is empty"
  // is not a guaranteeable precondition in this file.

  test("AC1/FR-9: adding an item via the picker + quantity + unit shows it listed with the entered display unit", async ({
    page,
  }) => {
    await page.goto("/pantry");

    const dialog = await openAddDialog(page);
    await pickIngredient(page, "Broccoli, raw");
    await fillQuantity(dialog, "2");
    await selectUnit(page, "lb");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(dialog).not.toBeVisible();

    const row = pantryRowFor(page, "Broccoli, raw");
    await expect(row).toBeVisible();
    await expect(row).toContainText(/2\s*lb/i);
  });

  test("AC2/AC3: adding the same ingredient again surfaces the increment/replace choice; choosing increment keeps a single row (same class)", async ({
    page,
  }) => {
    await page.goto("/pantry");

    const rowsBefore = await page.getByTestId("pantry-row").count();

    const dialog = await openAddDialog(page);
    await pickIngredient(page, "Broccoli, raw");
    await fillQuantity(dialog, "1");
    await selectUnit(page, "lb");
    await dialog.getByRole("button", { name: "Save" }).click();

    // Duplicate ingredient — the dialog must NOT just close and silently
    // create a second row; it must ask.
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/already .*pantry/i)).toBeVisible();
    const incrementButton = dialog.getByRole("button", { name: "Increment" });
    const replaceButton = dialog.getByRole("button", { name: "Replace" });
    await expect(incrementButton).toBeVisible();
    await expect(replaceButton).toBeVisible();

    await incrementButton.click();
    await expect(dialog).not.toBeVisible();

    // Still exactly one row for this ingredient, and the total row count
    // grew by exactly one across this whole test (from the fresh add in
    // the previous test), never two for the same ingredient.
    const rowsAfter = await page.getByTestId("pantry-row").count();
    expect(rowsAfter).toBe(rowsBefore);
    await expect(pantryRowFor(page, "Broccoli, raw")).toHaveCount(1);
  });

  test("AC4/FR-12: cross-class increment WITH density succeeds (converted + summed), never rejected", async ({
    page,
  }) => {
    await page.goto("/pantry");

    // Fresh add in mass units.
    const firstDialog = await openAddDialog(page);
    await pickIngredient(page, "Butter, salted");
    await fillQuantity(firstDialog, "200");
    await selectUnit(page, "g");
    await firstDialog.getByRole("button", { name: "Save" }).click();
    await expect(firstDialog).not.toBeVisible();
    await expect(pantryRowFor(page, "Butter, salted")).toHaveCount(1);

    // Increment in a VOLUME unit — cross-class, but this ingredient has
    // a density, so this must succeed (not be rejected).
    const secondDialog = await openAddDialog(page);
    await pickIngredient(page, "Butter, salted");
    await fillQuantity(secondDialog, "10");
    await selectUnit(page, "tbsp");
    await secondDialog.getByRole("button", { name: "Save" }).click();

    await expect(secondDialog).toBeVisible(); // needs-choice dialog, still open
    await secondDialog.getByRole("button", { name: "Increment" }).click();

    // Succeeds: dialog closes, no rejection message, still one row.
    await expect(secondDialog).not.toBeVisible();
    await expect(pantryRowFor(page, "Butter, salted")).toHaveCount(1);
  });

  test("AC5: cross-class increment WITHOUT density is rejected with an explanatory message, and Replace remains available", async ({
    page,
  }) => {
    await page.goto("/pantry");

    const firstDialog = await openAddDialog(page);
    await pickIngredient(page, "Spinach, raw");
    await fillQuantity(firstDialog, "100");
    await selectUnit(page, "g");
    await firstDialog.getByRole("button", { name: "Save" }).click();
    await expect(firstDialog).not.toBeVisible();
    await expect(pantryRowFor(page, "Spinach, raw")).toHaveCount(1);

    const secondDialog = await openAddDialog(page);
    await pickIngredient(page, "Spinach, raw");
    await fillQuantity(secondDialog, "1");
    await selectUnit(page, "cup");
    await secondDialog.getByRole("button", { name: "Save" }).click();

    await expect(secondDialog).toBeVisible();
    await secondDialog.getByRole("button", { name: "Increment" }).click();

    // Rejected — dialog stays open, explanatory message shown, never a
    // silent guess (architecture.md §4).
    await expect(secondDialog).toBeVisible();
    await expect(secondDialog.getByText(/cannot .*convert|no density|unresolved/i)).toBeVisible();

    const replaceButton = secondDialog.getByRole("button", { name: "Replace" });
    await expect(replaceButton).toBeVisible();
    await replaceButton.click();

    await expect(secondDialog).not.toBeVisible();
    await expect(pantryRowFor(page, "Spinach, raw")).toHaveCount(1);
    await expect(pantryRowFor(page, "Spinach, raw")).toContainText(/1\s*cup/i);
  });

  test("AC8: invalid input (no ingredient selected, non-positive quantity) blocks save client-side", async ({
    page,
  }) => {
    await page.goto("/pantry");

    const dialog = await openAddDialog(page);
    await fillQuantity(dialog, "0");
    await dialog.getByRole("button", { name: "Save" }).click();

    // Still open — inline validation blocked the save.
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/required|select an ingredient|positive/i)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});

test.describe("S-304 pantry add form at 375px (NFR-8)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-375", "375px assertions run only in the mobile-375 project");
  });

  test("the add-item dialog's fields are visible and tappable at 375px", async ({ page }) => {
    const response = await page.goto("/pantry");
    expect(response?.ok()).toBe(true);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);

    // Matches either the empty-state CTA or the persistent header
    // trigger, whichever this shared-DB run's current pantry state shows
    // (this project runs independently of the chromium-only serial suite
    // above, against the same persistent server/DB).
    const trigger = page.getByRole("button", { name: /add (your first )?pantry item/i }).first();
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Add pantry item" });
    await expect(dialog).toBeVisible();

    for (const locator of [
      page.getByRole("combobox", { name: "Ingredient" }),
      dialog.getByLabel("Quantity"),
      page.getByRole("combobox", { name: "Unit" }),
      dialog.getByRole("button", { name: "Save" }),
    ]) {
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(24);
    }

    // Read-only check — close without submitting so this project never
    // mutates pantry state (avoids racing the chromium-project's serial
    // suite, which asserts exact row counts).
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});
