# Proposal: expanded-nutrients

## Why

Labels carry saturated fat, trans fat, and cholesterol; the tracker
doesn't. Phosphorus is a common supplement/label value missing from the
micronutrient registry.

## What Changes

1. Three new optional per-reference nutrients with the exact
   fiber/sugar/alcohol semantics (null = not recorded, basis conversion
   scales, recipe totals all-or-incomplete, unit-labeled inputs on both
   forms, detail rows): saturated fat (g), trans fat (g), cholesterol
   (mg). Migration 0006.
2. `phosphorus` (mg) joins the micronutrient registry — no migration by
   design.
3. Cook mirrors carry the three to the service through the free-form
   micronutrient map (keys saturatedFatG/transFatG/cholesterolMg — the
   service's Nutrition has no such macro fields and doesn't need them);
   the Inventory day view labels those keys via a small display map.

## Impact

Mechanically the alcohol-tracking pattern × 3 + a registry line + mirror
keys. No service changes.
