## 1. Domain

- [x] 1.1 `resolveQuantityForComparison` gains nullable `packageQuantity`/`packageUnit` params; COUNT↔(MASS|VOLUME) bridge per design D1 (rule order, both directions, strict validity checks)
- [x] 1.2 Unit tests: 2 cans → 710 mL, 100 g → 0.5 each of a 200 g package, pantry-count scenario factor, unknown/lowercase package unit stays UNRESOLVED, non-positive package quantity stays UNRESOLVED, density path untouched

## 2. Callers

- [x] 2.1 `domain/matching.ts` + `domain/nutrition.ts` (and any other caller) pass the ingredient's package fields through
- [x] 2.2 Integration tests: recipe with a "1 each" line on a packaged VOLUME ingredient gets nutrition totals and is matchable; unpackaged case still unresolved

## 3. Schema + migration

- [x] 3.1 `ingredientSchema` + `customPantryItemSchema`: `packageUnit` must be a known `UNITS` key
- [x] 3.2 Drizzle data migration: normalize stored `packageUnit` values that case-insensitively match a known key
- [x] 3.3 Unit tests for both schemas; migration test (lowercase "ml" row → "mL")

## 4. UI

- [x] 4.1 Ingredient form + custom-item dialog: package unit free-text input → unit select (all classes)

## 5. E2E and verification

- [x] 5.1 e2e: create a VOLUME custom item packaged 355 mL, add "1 each" to a recipe → recipe shows nutrition (no "Unresolved"), what-can-I-cook treats 1-can stock as 355 mL
- [x] 5.2 `pnpm lint`, `npx tsc --noEmit`, `pnpm test:unit`, `pnpm test:integration`, targeted e2e green (watch recipe-*.spec.ts and custom-pantry-item.spec.ts)
- [x] 5.3 Manual browser walkthrough (verify the live Fanta recipe line resolves after deploy)
