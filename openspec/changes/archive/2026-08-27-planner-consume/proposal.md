# Proposal: planner-consume

## Why

Planned meals (eat_batch / eat_pantry) currently never transition to
"consumed" — eating requires a separate flow that appends a new eat_item
row, and forgetting it on the day means the log is wrong. Calvin wants:

- an Eat/Drink button ON the planned entry that logs it to that entry's
  own day (backdating covered when he catches up later);
- inventory never decremented by planning, only by consumption (already
  true service-side — now made visible: planned portions shown wherever
  batch availability is shown);
- removing an unconsumed entry frees its reservation (availability
  returns), and consumed entries can't be "removed back".

## What changes

- `plan_entry.consumedAt` (migration 0018, nullable text). eat_batch /
  eat_pantry entries gain a consume transition; eat_item stays the
  immediate-consumption record.
- New server action `consumePlanEntry(id)`: service-first, all-or-nothing,
  logs on the ENTRY's date (noon UTC when backdated), FIFO across the
  recipe's batches for eat_batch, package/basis-sized portions for
  eat_pantry, then marks consumedAt. Future dates refused.
- Planned-portion accounting: available = service remaining − ALL
  unconsumed eat_batch plan portions (any week, not just the visible one);
  planned counts surfaced in the planner picker, Ready-to-eat list, and
  the Batches admin page.
- Planner UI: per-entry Eat/Drink button (Drink for DRINK pantry
  products); consumed entries render an eaten/drunk badge, lose the
  consume AND remove buttons.
- Mobile parity: `POST /api/mobile/planner-entries/consume` (documented in
  lib/openapi.ts, Insomnia regenerated).

## Impact

- Migration 0018 (additive column). Backup export gains consumedAt.
- data/planner.ts availability math changes (all-dates unconsumed scope).
- No service changes (v0.1.0 API suffices).
