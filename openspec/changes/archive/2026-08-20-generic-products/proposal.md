# Proposal: generic-products

## Why

Recipes say "butter"; the store sells three brands of it. Today each
branded product is an island: a recipe referencing generic "Butter" sees
none of the branded butter in the pantry, and nothing ever asks which
brand actually went into the pot (they differ nutritionally).

## What Changes

1. **Products link to a generic** (`genericOfId`, migration 0011):
   one level deep, unit class must match, optional. Forms gain a
   "Generic of" picker; the detail page shows the link. Deleting a
   generic with linked products is refused with a friendly message.
2. **Interchangeable stock**: everywhere a recipe line's availability is
   computed (matching, What Can I Cook, planner depletion, shopping
   list), lines and pantry rows are normalized to the group root — a
   generic line sees the summed stock of the generic plus every linked
   product, and duplicate lines across a group aggregate instead of
   double-counting.
3. **Cook-time choice**: when a line's group has MULTIPLE stocked pantry
   products, the cook dialog requires choosing which one is being used;
   the chosen product's row is consumed. A single candidate behaves as
   today. (v1 keeps the existing simplification: the choice affects
   pantry consumption, not batch nutrition — same rule as substitutes.)

## Impact

Migration + validation + forms; `domain/interchange.ts` normalization
used by the matching/planner/shopping facades; cook preview/confirm
choice plumbing + dialog UI. Recipe authoring and nutrition math are
untouched.
