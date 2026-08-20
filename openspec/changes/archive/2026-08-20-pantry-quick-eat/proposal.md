# Proposal: pantry-quick-eat

## Why

Three frictions from real use: the portion slider tops out at 4× (a
1-serving beer recipe can't cook a case), a can of beer or bag of chips
shouldn't need a recipe at all, and cooking the same recipe twice shows
two inventory rows for what is one pool of leftovers.

## What Changes

1. **Portion slider to 24**: max becomes max(4 × servings, 24).
2. **Ready to eat** (migration 0013, `readyToEat` on ingredient):
   checkbox on both product forms; such items remain fully usable in
   recipes. Pantry rows for stocked ready-to-eat items gain an **Eat**
   button: a small dialog prefilled with 1 each (COUNT) or the package
   size, which — service-first, all-or-nothing — logs a direct
   service meal (mirroring the product as directlyLoggable), consumes
   the pantry, and records an `eat_item` plan entry on today so the
   planner tracks it. Plan-entry kinds widen to cook/eat_batch/eat_item
   (no migration — the column has no CHECK).
3. **Merged ready-to-consume**: the Inventory landing and the planner's
   ready-to-eat group/picker merge batches per recipe — one row, summed
   remaining portions; quick-log and batch plans target the OLDEST batch
   with portions (FIFO). The Batches admin page keeps per-batch rows.

## Impact

Migration + forms + eat action/dialog + plan-entry kind + grouping in
two facades. Cook flow untouched beyond the slider max.
