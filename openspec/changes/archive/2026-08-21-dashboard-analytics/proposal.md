# Month/year dashboard analytics

## Why
Month and year views only show totals and a table — the user wants
averages, trends, and diagrams to explore the data.

## What Changes
- KPI row on month/year: per-logged-day averages (calories, protein,
  meals, alcohol units/week) each with a % delta vs the PREVIOUS
  month/year (second range fetch).
- Two server-rendered single-hue SVG bar charts (dataviz-skill specs:
  thin rounded bars, 2px gaps, recessive grid, muted text, native
  tooltips, no legend for a single series): calories per day (month) /
  per month (year) and alcohol units per week (month) / per month
  (year), each with a dashed average line and — on month — a dashed
  target line (daily kcal cap, weekly units cap).
- The existing breakdown table stays as the accessible table view.
- Pure aggregation in domain/dashboardStats.ts (zero-filled series,
  logged-day averages, weekly CRDM bucketing, percent deltas).

## Impact
dashboard page + BarTrendChart component, domain/dashboardStats.ts,
unit tests, dashboard e2e, train v2.32.0.
