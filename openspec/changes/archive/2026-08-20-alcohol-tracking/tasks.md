## 1. Storage + schemas

- [x] 1.1 `data/schema.ts` += `alcoholGPerRef` nullable real; drizzle migration 0004
- [x] 1.2 `ingredientSchema` + `customPantryItemSchema` += optional non-negative `alcoholGPerRef`; `NutritionFieldValues`/`scaleNutritionFields` += alcohol (null passthrough)
- [x] 1.3 Repos/actions thread the field (ingredient insert/override, custom item create)

## 2. Nutrition + display

- [x] 2.1 `domain/nutrition.ts`: alcohol joins the optional keys (all-or-incomplete totals); recipe detail + pantry detail render an Alcohol row
- [x] 2.2 Both entry forms offer an Alcohol (g) input with the optional trio

## 3. Tests + verification

- [x] 3.1 Unit: schema accepts/absent, scaleNutritionFields alcohol, nutrition totals incomplete-when-missing
- [x] 3.2 Integration: create with per-355 mL basis stores scaled alcohol; absent stays null
- [x] 3.3 e2e: create custom item with alcohol → detail page shows it
- [x] 3.4 Full gate + walkthrough
