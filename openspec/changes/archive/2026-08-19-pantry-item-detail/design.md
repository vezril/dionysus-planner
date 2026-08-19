## Context

`dionysus-planner`'s pantry is one `pantry_item` row per ingredient (`ingredientId` is UNIQUE, FK `RESTRICT`). Nutrition already lives on `ingredient` (four required macros; fiber/sugar/sodium nullable per A-1). The pantry list (`app/pantry/page.tsx` + `PantryRow.tsx`) offers edit/remove dialogs but no detail navigation. There is no purchase/price concept anywhere in the app yet.

Demeter (Calvin's grocery/sales project) will eventually consume purchase history to match sales against what he actually buys — that integration is future scope, but the data model built here is its foundation, so the keying choice matters more than the UI.

## Goals / Non-Goals

**Goals:**
- Click a pantry row → detail page with nutrition facts and purchase history.
- Capture purchases (price required; store, bought-quantity optional) with minimal friction.
- Key purchases so the dataset is directly usable by Demeter later.

**Non-Goals:**
- No Demeter integration, no outbound calls, no sales/watchlist logic.
- No purchase editing (delete + re-add covers corrections).
- No currency handling (single-user, CAD implied).
- No unit-price normalization math yet — the optional bought-quantity fields make it possible later without a schema change.

## Decisions

**1. Purchases are keyed by `ingredientId`, not `pantryItemId`.**
The pantry row is ephemeral state ("what's on hand now"); purchase history is durable fact ("what I paid, where, when"). Deleting/re-adding a pantry item must not orphan or destroy price history, and Demeter will look prices up by ingredient. FK is `CASCADE` on ingredient delete: the app already blocks deleting ingredients referenced by recipes/pantry via its friendly-error flow, and if a custom ingredient genuinely goes away, its price history is meaningless — cascade over restrict avoids adding purchases to the "cannot delete because referenced" list for what is only historical metadata.

**2. Route is `/pantry/[id]` (pantry item id), resolving to the item + its ingredient + purchases by the ingredient's id.**
Matches the click path (the user clicks a pantry row) and the existing `app/recipes/[id]` convention: RSC page, `force-dynamic`, `notFound()` on a bad id, data fetched through a `data/` facade — never a self-HTTP call (ADR-004).

**3. `price` is a required REAL (dollars), `store` and bought-quantity/unit optional TEXT/REAL.**
Price is the one field the feature is pointless without; everything else is friction if mandatory. Bought-quantity uses the same `displayQuantity`/`displayUnit` verbatim-storage pattern as pantry/recipe lines (FR-9 precedent) but skips canonical conversion — purchases aren't matched against recipes, so canonicalization is premature; if unit-price math arrives later it can canonicalize on read.

**4. Derived stats (last paid, lowest price + store) are computed in `domain/` from the purchase list, not stored.**
Same computed-never-stored philosophy as cookability and remaining-portions. Pure function, unit-testable.

**5. Server Actions follow the existing `ActionResult`/`ActionError` contract** (`createPurchase`, `deletePurchase` in `app/actions/purchase-actions.ts`), re-validating with a shared Zod schema (`domain/validation/purchase.schema.ts`, ADR-005). `purchasedAt` is a `YYYY-MM-DD` date string (a purchase is a day-granularity fact; no time component to get timezone-wrong).

**6. The pantry row's whole name area becomes the link; the existing edit/remove buttons stay as-is.**
Smallest change that adds navigation without disturbing the row's tested layout (the 375px flex-wrap fixes from sidebar-nav).

## Risks / Trade-offs

- **[Risk] Cascade-deleting purchases with a custom ingredient silently drops history.** → Acceptable: the app's ingredient-delete flow already warns and blocks on recipe/pantry references; history for a deliberately deleted ingredient has no future value. Documented in the spec.
- **[Risk] Free-text `store` fields will drift ("Metro", "metro", "Metro Plouffe").** → Accepted for now; Demeter integration will need store normalization anyway, and normalizing at that boundary (with real requirements) beats inventing a store table today. Flagged as future scope.
- **[Risk] New migration on a live homelab DB.** → Drizzle migrations run at boot (`instrumentation.ts` flow); the new table is purely additive — no existing-table changes, no data backfill.

## Migration Plan

One additive drizzle migration creating `purchase`. No backfill. Rollback = drop table; nothing else references it.

## Open Questions

- None blocking. Store normalization and unit-price comparison are deliberately deferred to the Demeter integration change.
