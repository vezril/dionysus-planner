# Design: vitamin-tracking

## D1 — Registry as a versioned code constant

`domain/micronutrients.ts` exports `MICRONUTRIENTS: Record<key, {label,
unit}>` — vitamins A, C, D, E, K, B1, B2, B3, B6, B9 (folate), B12 and
minerals calcium, iron, magnesium, potassium, zinc. Units are the label
units (µg or mg per registry entry); IU entry is deferred — the registry
stores one canonical unit per nutrient and the user converts (open
question resolved: no IU math in v1). Extending the registry is a code
change, never a schema migration.

## D2 — Sparse row storage

`ingredient_micronutrient(ingredientId FK cascade, nutrientKey text,
amountPerRef real > 0, PK(ingredientId, nutrientKey))` — migration 0005.
Amounts are per the ingredient's reference quantity, exactly like macros;
nutrition-basis conversion scales them at save time. Writes are
replace-set per ingredient (same posture as recipe lines/tags).

## D3 — Entry UX: repeatable rows, not 16 inputs

Both entry forms gain a "Micronutrients" block: zero-or-more rows of
(nutrient select from the registry, amount input, remove), plus an "Add
micronutrient" button (react-hook-form `useFieldArray`). Schema:
optional array of `{key: registry key, amountPerRef > 0}`, duplicate
keys rejected.

## D4 — Display v1: ingredient-level only

The pantry detail page renders a "Micronutrients" section listing only
the nutrients present (label + amount + registry unit, per reference).
Recipe totals for micronutrients are DEFERRED: the all-or-N/A macro rule
would render sparse micros permanently N/A, and the "at least" partial
semantics deserves its own change once meal-level tracking (service
schema) exists. A supplement is just a COUNT custom item carrying
micronutrient rows — one capsule = 1 each, no dedicated UI.
