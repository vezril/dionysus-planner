import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * S-305 Pantry item edit & remove — end-to-end coverage
 * (docs/stories/S-305-pantry-edit-remove.md AC1, AC2, AC3).
 *
 * Shared-DB context: this whole e2e run drives one persistent SQLite
 * file/server across every spec file (playwright.config.ts's `webServer`),
 * and tests/e2e/pantry.spec.ts (S-304) already writes to the pantry using
 * "Broccoli, raw" / "Butter, salted" / "Spinach, raw". This file uses its
 * OWN, disjoint fixture ingredients ("Almonds, raw", "Blueberries, fresh")
 * and adds its own pantry rows via the existing add-item dialog before
 * exercising edit/remove, so it never collides with pantry.spec.ts's row
 * counts or assertions (both can run in the same worker run safely as long
 * as each only asserts about the rows it created — this suite never
 * asserts a total row count or an empty-state transition, which would be
 * unsafe to pin under a DB shared with pantry.spec.ts's own additions).
 *
 * `/app/pantry/page.tsx` currently renders each row as bare text (ingredient
 * name + display quantity/unit, no Edit/Remove affordance at all — see
 * S-304's implementation) and `PantryItemForm` only knows an "add" mode —
 * every test below is intentionally RED until the implementer adds the
 * edit/remove UI.
 *
 * ============================ PINNED CONTRACT (demanded surface) ==========
 * Pantry row (`data-testid="pantry-row"`, existing S-304 contract):
 *   - ALSO contains, scoped to that row:
 *     - `getByRole("button", { name: "Edit" })`
 *     - `getByRole("button", { name: "Remove" })`
 *
 * Edit dialog (opened by a row's "Edit" button; reuses `PantryItemForm` in
 * edit mode per the story's Dev Notes):
 *   - `getByRole("dialog", { name: "Edit pantry item" })`.
 *   - The ingredient itself is NOT editable in this dialog (only
 *     quantity/unit, per FR-7's "update a pantry item's quantity/unit") —
 *     the ingredient's name appears as plain (non-input) text somewhere in
 *     the dialog, e.g. `dialog.getByText(ingredientName)`.
 *   - `dialog.getByLabel("Quantity")` is PRE-FILLED with the row's current
 *     display quantity when the dialog opens (AC1).
 *   - `getByRole("combobox", { name: "Unit" })` (page-scoped, matching
 *     pantry.spec.ts's established convention for this same Select
 *     component, since Radix portals its listbox outside the dialog's DOM
 *     subtree) shows the row's current display unit as its pre-filled
 *     value when the dialog opens (AC1).
 *   - `dialog.getByRole("button", { name: "Save" })` submits. On success:
 *     dialog closes and the row's displayed quantity/unit updates
 *     immediately to the newly entered values (AC2) — no page reload
 *     required (matches the add flow's `router.refresh()` pattern).
 *
 * Remove confirmation (opened by a row's "Remove" button):
 *   - `getByRole("dialog", { name: /remove/i })` (or the Radix
 *     `alertdialog` role — either satisfies "a confirmation," per the
 *     story's Dev Notes' "remove button + confirmation").
 *   - Contains text naming the ingredient being removed (so the user
 *     knows what they're about to delete) and two controls:
 *     `getByRole("button", { name: "Cancel" })` and
 *     `getByRole("button", { name: "Confirm remove" })`.
 *   - "Cancel" closes the confirmation WITHOUT deleting anything — the row
 *     is still present afterward.
 *   - "Confirm remove" performs the delete: the confirmation closes and
 *     the row disappears from the list immediately (AC3/FR-8), without a
 *     full page reload.
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

/** Adds a brand-new pantry row for `ingredientName` via the existing S-304
 * add dialog, so this suite's own fixtures are set up independently of
 * pantry.spec.ts's. */
async function addPantryItem(page: Page, ingredientName: string, quantity: string, unit: string): Promise<void> {
  await page.goto("/pantry");
  const dialog = await openAddDialog(page);
  await pickIngredient(page, ingredientName);
  await fillQuantity(dialog, quantity);
  await selectUnit(page, unit);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(pantryRowFor(page, ingredientName)).toHaveCount(1);
}

test.describe("S-305 pantry item edit & remove", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "detailed pantry edit/remove ACs verified once on chromium");
  });

  test("AC1/AC2: edit control opens a pre-filled dialog, and saving a new quantity updates the row immediately", async ({
    page,
  }) => {
    await addPantryItem(page, "Almonds, raw", "2", "lb");

    const row = pantryRowFor(page, "Almonds, raw");
    await expect(row).toContainText(/2\s*lb/i);

    await row.getByRole("button", { name: "Edit" }).click();

    const dialog = page.getByRole("dialog", { name: "Edit pantry item" });
    await expect(dialog).toBeVisible();

    // AC1: pre-filled with the row's CURRENT display quantity/unit.
    await expect(dialog.getByText("Almonds, raw")).toBeVisible();
    await expect(dialog.getByLabel("Quantity")).toHaveValue("2");
    await expect(page.getByRole("combobox", { name: "Unit" })).toContainText("lb");

    // AC2: changing the quantity and saving updates the list immediately.
    await dialog.getByLabel("Quantity").fill("1");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(dialog).not.toBeVisible();
    await expect(pantryRowFor(page, "Almonds, raw")).toContainText(/1\s*lb/i);
    await expect(pantryRowFor(page, "Almonds, raw")).not.toContainText(/2\s*lb/i);
  });

  test("AC3/FR-8: remove control asks for confirmation; cancelling keeps the row, confirming deletes it", async ({
    page,
  }) => {
    await addPantryItem(page, "Blueberries, fresh", "300", "g");

    const row = pantryRowFor(page, "Blueberries, fresh");
    await row.getByRole("button", { name: "Remove" }).click();

    const confirmDialog = page.getByRole("dialog", { name: /remove/i });
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText("Blueberries, fresh")).toBeVisible();

    // Cancel — nothing is deleted.
    await confirmDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmDialog).not.toBeVisible();
    await expect(pantryRowFor(page, "Blueberries, fresh")).toHaveCount(1);

    // Now actually confirm removal.
    await row.getByRole("button", { name: "Remove" }).click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Confirm remove" }).click();

    await expect(confirmDialog).not.toBeVisible();
    await expect(pantryRowFor(page, "Blueberries, fresh")).toHaveCount(0);
  });
});
