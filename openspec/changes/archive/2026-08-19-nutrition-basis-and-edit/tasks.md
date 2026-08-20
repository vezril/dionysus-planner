## 1. Domain

- [x] 1.1 `domain/nutritionBasis.ts` — `nutritionScaleFactor(basisQuantity, basisUnit, unitClass)` (typed error on class mismatch; factor = REF / canonical basis) + `scaleNutritionFields(fields, factor)` (nulls pass through, round to 4 decimals)
- [x] 1.2 Unit tests: 355 mL soda scenario, per-2-count halving, default-basis identity (factor 1), class-mismatch error, null passthrough, rounding

## 2. Schemas

- [x] 2.1 `ingredientSchema` + `customPantryItemSchema` += optional `nutritionBasisQuantity` (> 0) and `nutritionBasisUnit` (known unit key); quantity-requires-unit refine (same pattern as package fields)
- [x] 2.2 Unit tests for both

## 3. Server Actions

- [x] 3.1 `createIngredient` + `overrideIngredientNutrition`: apply the scale factor (class-mismatch → `fieldErrors.nutritionBasisUnit`) before persisting
- [x] 3.2 `createCustomPantryItem`: same conversion
- [x] 3.3 Integration tests: per-355 mL create stores scaled per-100 mL values; mismatch rejected writes nothing; absent basis unchanged (existing tests double as back-compat proof)

## 4. UI

- [x] 4.1 `IngredientForm`: basis inputs (quantity + unit select constrained to the chosen class), defaulting to the class reference and re-defaulting when the class changes; live "per ⟨basis⟩" legend
- [x] 4.2 `CreateCustomItemDialog`: same basis inputs
- [x] 4.3 `/pantry/[id]`: "Edit details" link → `/ingredients/{ingredientId}/edit`

## 5. E2E and verification

- [x] 5.1 e2e: create a VOLUME custom item entering per-355 mL values → detail page shows scaled per-100 mL facts; "Edit details" round-trip fixes a barcode and it shows on the product panel
- [x] 5.2 `pnpm lint`, `npx tsc --noEmit`, `pnpm test:unit`, `pnpm test:integration`, targeted e2e green
- [x] 5.3 Manual browser walkthrough
