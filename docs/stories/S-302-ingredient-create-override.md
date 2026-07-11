# S-302: Ingredient create & nutrition override

**Epic:** E-3 Ingredients & Pantry | **Status:** TODO | **Depends on:** S-301
**Covers:** FR-2, FR-3 / (FR-12 data entry: density field)

## Context

The catalog view exists (S-301). This story adds writing: the Zod ingredient schema, the create form (custom ingredients), the edit/override form (any ingredient, including seeded), and the `createIngredient` / `overrideIngredientNutrition` Server Actions — including setting the `overridden` flag that FR-28's seed logic depends on. Read: prd.md FR-2, FR-3, UJ-5, A-1; architecture.md §4 Ingredient (field semantics, `overridden` rules), ADR-005 (shared Zod schema, server re-validation), §6 error-handling strategy (discriminated-union action results).

## Acceptance Criteria

1. Given the create form, when submitted with name, unit class, and required macros (calories, protein, carbs, fat), then a retrievable CUSTOM ingredient is created and appears in the catalog (FR-2).
2. Given the create form, when required fields are missing/invalid (negative macros, no unit class), then save is blocked with inline field errors, and the same submission sent directly to the Server Action (bypassing the client) is rejected server-side with field errors (FR-2 AC + ADR-005 server re-validation).
3. Given optional fields (fiber, sugar, sodium) and optional density (g/mL), when provided, then they persist; when omitted, then they store as null (A-1, FR-12).
4. Given a SEEDED ingredient's edit form, when its calorie value is changed and saved, then `overridden` becomes `true`, the new value is used by every recipe referencing it on next computation/display, and the catalog identity (id, seedKey) is untouched (FR-3 AC).
5. Given a CUSTOM ingredient edit, when saved, then values update and `overridden` remains false/meaningless (architecture §4).
6. Given an already-overridden seeded ingredient, when edited again, then it saves normally and stays `overridden=true`.

## Tasks

- [ ] TEST: (unit, `tests/unit/domain/ingredient-schema.test.ts`) `domain/validation/ingredient.schema.ts` — valid payload passes; missing name/unitClass/required macro fails with field-level errors; negative numbers fail; optional fields nullable; density optional positive number.
- [ ] IMPL: `ingredient.schema.ts` (Zod, per ADR-005 — single source of "valid" for client and server).
- [ ] TEST: (integration, `tests/integration/ingredient-actions.test.ts`) `createIngredient` — valid input creates row with `source='CUSTOM'`, `overridden=false`; invalid input returns `{ ok: false, error: { fieldErrors } }` and writes nothing (architecture §6 error shape).
- [ ] IMPL: `app/actions/ingredient-actions.ts#createIngredient` — parse with Zod, call ingredientRepo, revalidate the catalog path.
- [ ] TEST: (integration) `overrideIngredientNutrition` — editing a SEEDED row sets `overridden=true` and updates values; editing a CUSTOM row updates values without semantic use of the flag; editing an overridden row keeps flag true; identity fields (id, seedKey, source) never change.
- [ ] IMPL: `overrideIngredientNutrition` action.
- [ ] TEST: (e2e, `tests/e2e/ingredient-forms.spec.ts`) create flow — open create form from catalog CTA, submit incomplete → inline errors shown; complete → new ingredient visible in catalog (FR-2 AC end-to-end).
- [ ] IMPL: create form page/dialog (client component, react-hook-form + zodResolver per ADR-005) under `/app/ingredients`.
- [ ] TEST: (e2e) override flow — edit a seeded ingredient's calories; catalog/detail reflects new value (recipe-propagation e2e assertion completes in S-403 once recipe detail exists).
- [ ] IMPL: `app/ingredients/[id]/edit/page.tsx` — pre-filled edit form (FR-3 create/override per architecture §5).

## Dev Notes

- Touches `/domain/validation/ingredient.schema.ts`, `/app/actions/ingredient-actions.ts`, `/app/ingredients/**`, tests. Repos unchanged (S-202 provides create/update).
- ADR-005 is non-negotiable: the Server Action re-parses input with the same Zod schema; client validation is UX only, never authorization to write.
- The `overridden` flag transition (false→true on first seeded edit) is what protects user edits across re-seeds (FR-28) — it must be set in the action's transaction, not client-side.
- `source` is set at insert and never changes; do not expose it as an editable field (architecture §4).
- Action results use the discriminated union `{ ok: true, data } | { ok: false, error }` — never throw for expected validation failures (architecture §6).
- OUT of scope: delete (S-303), inline creation from within pantry/recipe pickers (S-304/S-401 may link to this form; building picker-embedded creation there).
