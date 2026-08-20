# Proposal: batch-nutrition-and-abv-entry

## Why

Two fidelity gaps: (1) the cook mirror always uses the recipe's authored
(generic) nutrition, so picking Kirkland over Lactantia — or substituting
— changes what you ate but not what the day log says; (2) alcohol on
drinks is entered in grams when every label says % ABV.

## What Changes

1. **Actual-ingredient mirrors**: the cook flow builds service recipe
   lines from what actually went in — the picked product, the
   substitute (at its entered quantity, de-scaled to authored basis), or
   the authored ingredient (defaults and ignored lines — ignored skips
   stock, not stomach). Service recipe reuse matches name + line
   signature (ingredient ids + quantities), so variant cooks create
   variant service recipes instead of lying through a stale mirror.
2. **ABV entry**: on VOLUME-class Drink products both forms replace
   "Alcohol (g)" with "Alcohol (% ABV)" (0–100), converted at save via
   ethanol density (g per 100 mL = ABV × 0.789) and converted back on
   edit. ABV is a ratio, so it is exempt from nutrition-basis scaling.
   Storage stays `alcoholGPerRef` — no domain or rollup changes. The
   detail page shows the derived ABV next to the grams for such items.

## Impact

Cook-actions mirror section + tests; schemas + actions + both forms +
detail display for ABV. No migrations.
