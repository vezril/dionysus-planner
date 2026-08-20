# Proposal: pantry-freshness

## Why

The pantry knows how much is on hand but not how long it's been sitting
there — Calvin wants "this is about to expire" signals.

## What Changes

1. **`stockedAt` on pantry rows** (migration 0008, backfilled from
   `updatedAt`): set on row creation and RESET whenever the on-hand
   quantity INCREASES (add, increment, replace, edit upward). Decreases
   (cooking, eating, edit downward) keep it — you're aging the same
   stock. Documented approximation: mixed old+new stock takes the newest
   date.
2. **Optional `shelfLifeDays` on products** (same migration): entry on
   both forms ("Shelf life (days)").
3. **Freshness display**: pure `domain/freshness.ts` classifies a row —
   fresh / expiring (≤3 days left) / expired — from stockedAt + shelf
   life. Pantry list rows show "stocked Nd ago" plus an amber "~Nd left"
   or red "check it" badge when a shelf life exists; the detail page
   shows stocked date and estimated expiry.

## Impact

Migration, one domain module, pantry repo/action/facade threading, list
+ detail rendering, form fields. No service involvement.
