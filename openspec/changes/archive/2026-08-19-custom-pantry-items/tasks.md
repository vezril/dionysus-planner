## 1. Schema and data layer

- [x] 1.1 `data/schema.ts`: `ingredient` += `brand` (text, null), `barcode` (text, null), `packageQuantity` (real, null), `packageUnit` (text, null); unique index on `barcode`; generate the drizzle migration
- [x] 1.2 `ingredientRepo` + `data/ingredients.ts`: thread the four new fields through `IngredientRecord`/insert/update; add `getByBarcode` (the duplicate pre-check, and the scanner app's future lookup)
- [x] 1.3 New `data/` facade `createCustomPantryItem(...)`: ingredient insert + pantry insert in ONE better-sqlite3 transaction
- [x] 1.4 Integration tests: barcode uniqueness (incl. NULLs coexisting), transactional all-or-nothing, fields round-trip

## 2. Domain / validation

- [x] 2.1 `ingredientSchema` += optional `brand`/`barcode`/`packageQuantity`/`packageUnit` (package unit required-iff-quantity, same pattern as purchases)
- [x] 2.2 New `customPantryItemSchema` = ingredient fields + `initialQuantity: min(0)` + `unit`
- [x] 2.3 `pantryItemSchema`/`pantryItemUpdateSchema`: `positive()` → `min(0)` with an updated message; audit existing tests pinning the old "> 0" rejection and update them as deliberate behavior change
- [x] 2.4 Unit tests for all schema changes

## 3. Server Action

- [x] 3.1 `app/actions/custom-pantry-item-actions.ts` — `createCustomPantryItem(input)`: re-validate, duplicate-barcode pre-check (field error) + UNIQUE-race catch mapped to the same field error, transactional facade call, revalidate `/pantry`
- [x] 3.2 Integration tests (pinned contract): success, zero-quantity success, validation failure writes nothing, duplicate barcode field error

## 4. UI

- [x] 4.1 `/pantry`: "Create custom item" button + dialog form (`CreateCustomItemDialog`) — product fields, nutrition, initial quantity (0 allowed)
- [x] 4.2 `IngredientForm` (+ `ingredient-actions` create/update paths) gains the four optional product fields
- [x] 4.3 `PantryRow` + `EditPantryItemDialog`: accept quantity 0; zero rows render `data-testid="out-of-stock"` instead of the quantity text
- [x] 4.4 `/pantry/[id]`: product panel (brand / barcode / package size) rendered only when at least one field present
- [x] 4.5 `data/pantry.ts` list row: include what the out-of-stock render needs (quantityCanonical already present — verify)

## 5. E2E and verification

- [x] 5.1 `tests/e2e/custom-pantry-item.spec.ts`: create Ritz-style item (with barcode) from pantry → appears listed; zero-initial-quantity → out-of-stock badge; duplicate barcode rejected; detail page shows product panel; edit-to-zero persists row; restock clears badge
- [x] 5.2 Audit existing pantry e2e for `> 0` assumptions; update deliberately
- [x] 5.3 `pnpm lint`, `npx tsc --noEmit`, `pnpm test:unit`, `pnpm test:integration`, targeted e2e green
- [x] 5.4 Manual browser walkthrough
