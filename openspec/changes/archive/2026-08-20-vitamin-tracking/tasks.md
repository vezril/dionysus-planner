## 1. Domain

- [x] 1.1 `domain/micronutrients.ts` registry (16 nutrients, label + unit); `micronutrientSchema` (registry key, amount > 0, unique keys) folded into both entry schemas as optional `micronutrients` array
- [x] 1.2 Unit tests: registry shape, schema accept/duplicate-reject, basis scaling of amounts

## 2. Storage

- [x] 2.1 `ingredient_micronutrient` table (schema + migration 0005, FK cascade, PK pair)
- [x] 2.2 Repo: `replaceForIngredient`, `getByIngredientId`; threaded through ingredient create/override + custom-item create (scaled by the basis factor); pantry-detail facade returns them
- [x] 2.3 Integration tests: round-trip, replace-set on edit, cascade on delete, basis-scaled persist

## 3. UI

- [x] 3.1 Both entry forms: useFieldArray "Micronutrients" block (select + amount + remove, Add button); edit form prefills existing rows
- [x] 3.2 Pantry detail: Micronutrients section (present-only)
- [x] 3.3 e2e: COUNT supplement with vitamin D → detail shows it; per-355 mL vitamin C scales

## 4. Verification

- [x] 4.1 Full gate (lint, tsc, unit, integration, chromium e2e)
- [x] 4.2 Walkthrough
