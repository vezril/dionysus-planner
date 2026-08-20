# Design: alcohol-tracking

## D1 — Alcohol is a fourth optional nutrient, nothing more

`alcoholGPerRef` (nullable real, grams per reference quantity) joins
fiber/sugar/sodium everywhere they appear, with identical semantics:
null = not recorded (never a stand-in zero); recipe totals complete only
when every constituent has it; nutrition-basis conversion scales it;
detail pages render "not recorded" when absent. Label "Alcohol", unit g.

No derived calories (calories stay label-entered), no limits/warnings,
no service mirroring (the service's own `abvPercent` is a different,
drink-strength concept — untouched). Migration 0004 adds the column.
