# Proposal: consumption-dashboard

## Why

Consumption is only visible one day at a time (Inventory's day view).
Calvin wants the overview — what got eaten and drunk by day, week,
month, year — with alcohol expressed in CRDM standard units, not grams.

## What Changes

1. **`/dashboard`** (nav after What Can I Cook): period tabs day/week/
   month/year with prev/next navigation, powered by the service's new
   range endpoint (one call per view). Shows period totals (calories,
   protein/carbs/fat, sodium), meal count, and **alcohol units**; a
   breakdown table (days for day/week/month, months for year) with
   kcal/meals/units per row. Service down → clear message, no fake data.
2. **CRDM alcohol units**: units = (mL ethanol) / 17 = grams / 0.789 /
   17 — a 355 mL 5% beer = 1.04 units. Displayed to 2 decimals.
3. **Alcohol reaches day logs**: the cook mirror's micronutrient map
   gains `alcoholG` (÷ reference, like sat fat/cholesterol), labeled on
   the Inventory day view.

## Impact

Mirror map addition, `getLogRange` client fn, dashboard page + nav (+
pin updates), alcohol-units domain fn. Pairs with service change
log-range (already live).
