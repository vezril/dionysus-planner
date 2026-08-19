## Why

Pantry rows today are a flat list — clicking one only offers edit/remove. Calvin wants to click a pantry item and see what he's actually holding: the ingredient's nutrition facts, and a purchase history (where it was bought, what it cost). Price history per ingredient is also the data seam for the planned Demeter integration (sales/watchlist matching) — Demeter will eventually need "what does Calvin buy and what does he usually pay" keyed by ingredient, so capturing purchases now builds that dataset without waiting on the integration.

## What Changes

- Pantry rows become links to a new detail page, `/pantry/[id]`.
- The detail page shows:
  - the item header (ingredient name, on-hand quantity in display units),
  - a nutrition-facts panel from the linked ingredient (calories/protein/carbs/fat per reference unit, plus fiber/sugar/sodium when present — they're optional fields on the planner's ingredient model),
  - a purchase history: a list of logged purchases plus an add form.
- New `purchase` table: `ingredientId` (FK), `price` (required), `store` (optional), purchased quantity + unit (optional — enables unit-price comparison later), `purchasedAt` date. Keyed by **ingredient**, not pantry-item row, so history survives pantry churn and matches how Demeter will look things up.
- Simple derived stats on the page: last price paid, and the lowest recorded price with its store.
- Purchases are deletable (typo correction); not editable (delete + re-add, keeps the model simple).
- No nav change — the page is reached from the pantry list.
- Standing invariant unchanged: no outbound network calls. Demeter integration itself is explicitly future scope; this change only shapes the data it will read.

## Capabilities

### New Capabilities
- `pantry-item-detail`: the pantry item detail view — nutrition facts, purchase logging/history, and derived price stats.

### Modified Capabilities
(none — no existing spec's requirements change; pantry list/edit/remove behavior is untouched, rows just additionally link somewhere)

## Impact

- Affects: `data/schema.ts` (+ new drizzle migration), new `data/purchases.ts` facade + repository, `domain/validation/purchase.schema.ts`, `app/actions/purchase-actions.ts`, new `app/pantry/[id]/` route + components, a link added to `app/pantry/_components/PantryRow.tsx`.
- No changes to dionysus-service, the Meal Log section, or any existing capability spec.
- Anticipated future scope (not built here): Demeter sales matching reading the purchase history; a shopping-list seam.
