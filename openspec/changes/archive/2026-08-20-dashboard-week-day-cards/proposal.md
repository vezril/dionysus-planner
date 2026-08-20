# Dashboard week: per-day summary cards

## Why
The weekly dashboard shows one totals block and a flat table. The user
wants a per-day summary (a smaller day view) inside the week, and to
click a day to open its detailed view.

## What Changes
- On `period=week`, replace the breakdown table with seven per-day
  cards — one per calendar date in the week, including unlogged days.
- Each card is a mini day view: weekday + date, meals, calories,
  protein / carbs / fat, alcohol units, with day-level fit coloring on
  calories and protein (same semantics as the day period).
- The whole card links to `/dashboard?period=day&date=<date>` — the
  detailed day view (which already links onward to the Inventory day
  log's date).
- Day / month / year periods keep the existing table.

## Impact
- `app/dashboard/page.tsx` (+ a small server component for the cards)
- e2e: dashboard.spec.ts week-cards coverage (service-gated)
