## 1. Nav

- [x] 1.1 `components/nav.tsx`: reorder to What Can I Cook, Ingredients, Pantry, Recipes, Meals; label "Meal Log" → "Meals"
- [x] 1.2 `/meal-log` pages: h1 "Meal Log" → "Meals" (keep sub-page headings consistent)
- [x] 1.3 Update pinned e2e (shell.spec.ts order/label pins, meal-log-flow.spec.ts heading pins)

## 2. Portion slider

- [x] 2.1 `PortionScaler` client component on `/recipes/[id]`: slider (1..4×servings, default servings), rescales line quantities + totals client-side per design D2; per-serving untouched; N/A stays N/A
- [x] 2.2 Unit tests for the scaling formatter (2-decimal trim, factor 1 identity, N/A passthrough)
- [x] 2.3 e2e: 4-serving recipe at 6 shows scaled line + totals, per-serving unchanged; slider back to default restores original rendering

## 3. Delete on detail

- [x] 3.1 Render `DeleteRecipeButton` on `/recipes/[id]` (header area)
- [x] 3.2 e2e: delete from detail navigates to `/recipes` with the row gone; cancel is a no-op (extend recipe-detail.spec.ts or new spec)

## 4. Verification

- [x] 4.1 `pnpm lint`, `npx tsc --noEmit`, `pnpm test:unit`, `pnpm test:integration`, full chromium e2e green
- [x] 4.2 Manual browser walkthrough
