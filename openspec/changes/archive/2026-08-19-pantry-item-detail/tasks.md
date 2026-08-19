## 1. Schema and data layer

- [x] 1.1 `data/schema.ts`: new `purchase` table — `id`, `ingredientId` (FK `CASCADE`), `price` (real, not null), `store` (text, nullable), `displayQuantity` (real, nullable), `displayUnit` (text, nullable), `purchasedAt` (text, `YYYY-MM-DD`, not null), `createdAt`; generate the drizzle migration
- [x] 1.2 `data/repositories/purchaseRepo.ts` — `create`, `listByIngredientId` (most recent first), `deleteById`
- [x] 1.3 `data/purchases.ts` facade + extend `data/pantry.ts` (or equivalent) with `getPantryItemDetail(id)` returning item + ingredient + purchases in one call
- [x] 1.4 Integration tests: `tests/integration/repositories/purchaseRepo.test.ts` (ordering, cascade-on-ingredient-delete, survives pantry item removal)

## 2. Domain

- [x] 2.1 `domain/priceStats.ts` — pure `computePriceStats(purchases)` → `{ lastPaid, lowest: { price, store? } } | null`
- [x] 2.2 `domain/validation/purchase.schema.ts` — Zod: price required ≥ 0, store optional trimmed non-empty, quantity optional > 0 with unit required-iff-quantity, `purchasedAt` `YYYY-MM-DD` real-date check
- [x] 2.3 Unit tests for both (`tests/unit/domain/priceStats.test.ts`, `purchase-schema.test.ts`)

## 3. Server Actions

- [x] 3.1 `app/actions/purchase-actions.ts` — `createPurchase(input)`, `deletePurchase(id)`; existing `ActionResult`/`ActionError` contract, Zod re-validation (ADR-005), `revalidatePath` the detail page
- [x] 3.2 Integration tests: `tests/integration/purchase-actions.test.ts` (pinned-contract style, temp DB)

## 4. UI

- [x] 4.1 `app/pantry/[id]/page.tsx` — RSC, `force-dynamic`, `notFound()` on bad id; header (name + on-hand display quantity), nutrition-facts panel (optional fields omitted when null, never rendered as 0), price stats, purchase history list
- [x] 4.2 `app/pantry/[id]/_components/AddPurchaseForm.tsx` — react-hook-form + zodResolver, date defaulting to today, server `fieldErrors` mapped via `setError` (same pattern as `ingredient-form.tsx`)
- [x] 4.3 `app/pantry/[id]/_components/DeletePurchaseButton.tsx` — confirm dialog matching existing remove-dialog pattern
- [x] 4.4 `app/pantry/_components/PantryRow.tsx` — item name becomes a `Link` to `/pantry/{id}`; edit/remove buttons untouched
- [x] 4.5 Covered by the ROOT `app/not-found.tsx` boundary (`notFound()` bubbles to it — same as `/recipes/[id]`, which has no per-route file either) and the existing `app/pantry/error.tsx`; no new files needed

## 5. E2E and verification

- [x] 5.1 `tests/e2e/pantry-detail.spec.ts` — navigate from list, nutrition facts visible, log a purchase (price-only and full), stats update, delete purchase, history survives remove/re-add of the pantry item, unknown id → not-found; chromium-only functional ACs per suite convention
- [x] 5.2 375px check: detail page has no horizontal scroll (mobile-375 project)
- [x] 5.3 `pnpm lint`, `npx tsc --noEmit`, `pnpm test:unit`, `pnpm test:integration`, targeted e2e green
- [x] 5.4 Manual browser walkthrough via the dev server against a seeded DB
