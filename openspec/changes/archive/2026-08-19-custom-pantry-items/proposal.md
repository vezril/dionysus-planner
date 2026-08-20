## Why

Calvin wants to stock the pantry with real branded products ("Ritz crackers"), not just generic ingredients — created in one step from the pantry page, with product identity captured (barcode above all): the explicit long-term plan is a scanning app that adds items automatically, so every product field captured now is that app's lookup key later. And a product you're temporarily out of is still *your* product — running out must not erase it from the pantry.

Today this takes two disconnected steps (create a custom ingredient at `/ingredients/new`, then add it at `/pantry`), captures no product identity (no barcode/brand/package size anywhere in the model), and a pantry row at zero quantity can't exist (`quantity > 0` is enforced) — the only way to record "none left" is deleting the row.

## What Changes

- `ingredient` gains optional **product-identity fields**: `brand`, `barcode` (unique when present — the future scanner's lookup key), `packageQuantity` + `packageUnit` (net contents, e.g. 200 g a box). No parallel "product" table — a branded product IS a custom ingredient with identity attached (same no-parallel-model reasoning as dionysus-service's directly-loggable design).
- New **"Create custom item"** button on `/pantry` → a one-step form: name, brand, barcode, package size, unit class, full nutrition (same fields as the ingredient form), and an initial on-hand quantity (**zero allowed**). One Server Action creates the CUSTOM ingredient and its pantry row transactionally.
- **Zero-quantity pantry rows are now valid** — add and edit both accept `quantity >= 0`; a zero row renders an "out of stock" state on the list and stays put. **MODIFIED behavior**: the previous `> 0` rule (S-304 era, pre-openspec — no existing capability spec governs it). Explicit removal via the Remove button is unchanged and remains the only way a row leaves the pantry.
- The existing ingredient form (`/ingredients/new` + edit) gains the same optional product fields — one shared form component, both flows benefit.
- `/pantry/[id]` (the detail page from pantry-item-detail) additionally shows brand / barcode / package size when present.
- Cookability ("what can I cook") needs no change: a zero-quantity row is simply insufficient stock, which the matcher already handles.

## Capabilities

### New Capabilities
- `custom-pantry-items`: product-identity fields on ingredients, the one-step create-custom-item flow from the pantry, and zero-quantity pantry persistence.

### Modified Capabilities
- `pantry-item-detail`: the detail page additionally displays product identity (brand, barcode, package size) when present.

## Impact

- `data/schema.ts` (+ additive migration: 4 nullable ingredient columns, unique index on barcode), `ingredientRepo`/`data/ingredients.ts` (new fields), `pantryItemSchema` (`positive` → `min(0)`), `ingredientSchema` (+ optional product fields), new combined `customPantryItemSchema`, new Server Action, new dialog/form component on `/pantry`, `IngredientForm` extension, `PantryRow` out-of-stock state, `/pantry/[id]` product-identity panel.
- Anticipated future scope (not built here): barcode-scan lookup endpoint/app; Demeter store/price integration (unchanged from pantry-item-detail).
