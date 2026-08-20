## Why

Two friction points from real use of custom pantry items:

1. **No edit path from the pantry.** The pantry row's Edit button only changes quantity; fixing a typo'd barcode or nutrition value means knowing to go hunt the item down under `/ingredients`. The full edit form already exists there — it's just unreachable from where the user actually is.
2. **Nutrition labels aren't per-100.** A 355 mL soda can lists values for the can; the app demands per-100mL, forcing mental arithmetic on every packaged product. Calvin: "I don't want to have to do the math."

## What Changes

- **Nutrition basis selector** on both nutrition-entry forms (the pantry "Create custom item" dialog and the shared ingredient form used by `/ingredients/new` + edit): a "per ⟨quantity⟩ ⟨unit⟩" pair defaulting to the reference basis (100 g / 100 mL / 1). Enter the label's values verbatim against any basis in the ingredient's unit class ("per 355 mL", "per 30 g serving", "per 2 cookies") and the Server Action converts to per-reference before persisting. **Storage is unchanged** — everything downstream (recipes, matching, meal math, detail pages) still reads per-reference values.
- The basis unit must belong to the ingredient's unit class (a MASS ingredient can't have a per-mL basis) — a field error, never a silent guess (FR-11's spirit).
- **"Edit details" link** on `/pantry/[id]` → the ingredient edit form, so nutrition/brand/barcode/package fixes are one click from the pantry. (On edit, stored per-reference values prefill with the reference basis selected — no reverse conversion needed or implied.)
- Applies to all ingredients, not just custom ones — seeded items keep their existing override-on-edit semantics; the basis selector simply feeds the same fields.

## Capabilities

### New Capabilities
(none — both are refinements of existing capabilities)

### Modified Capabilities
- `custom-pantry-items`: the create form accepts nutrition on any same-class basis and converts to per-reference on save.
- `pantry-item-detail`: the detail page links to editing the item's details.

## Impact

- New pure `domain/nutritionBasis.ts` (scale factor + application); `ingredientSchema`/`customPantryItemSchema` gain optional basis fields; `createIngredient`/`overrideIngredientNutrition`/`createCustomPantryItem` convert before persisting; `IngredientForm` + `CreateCustomItemDialog` gain the basis inputs; `/pantry/[id]` gains the link. No schema/DB migration. No downstream consumer changes.
