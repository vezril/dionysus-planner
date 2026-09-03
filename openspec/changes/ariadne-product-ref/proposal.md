# Proposal: ariadne-product-ref

## Why

Step P1 of the agreed Ariadne migration (ariadne-service
`docs/migration-dionysus.md` rev 2, coordinated 2026-09-03). Ariadne owns
market identity — brand, barcode, package size, prices, purchases — and
the planner keeps everything meal-shaped. The link between the two is a
single nullable reference on our ingredient.

This lands the reference and nothing else. No client, no reads, no
behaviour change: the column exists so later steps have something to
write into, and so the schema stops being the thing blocking them.

## What changes

- `ingredient.productId` (migration 0020, nullable TEXT, no FK — the id
  belongs to another system). Carried through the ingredient record,
  create/update paths, and the backup export.
- Nothing reads it. No UI, no API surface, no resolution.

## Why nullable, permanently

An ingredient may legitimately have no market product — "salt to taste",
water, a garden tomato — and per the coordination thread that stays true
forever, not just until the backfill. Nothing in meal planning, cooking,
or logging may ever require it; only pricing and product display will,
and both degrade to their local values when it is absent.

## Impact

- Additive and reversible: ignoring the column reverts behaviour
  entirely. Nothing is destroyed at this step.
- Explicitly NOT in scope (later, gated on Calvin and on Ariadne's Flipp
  ingestion landing): the REST client, ResolveProduct backfill, the
  scanner cutover, shopping-list pricing, purchase migration, and
  removal of our local market fields.
