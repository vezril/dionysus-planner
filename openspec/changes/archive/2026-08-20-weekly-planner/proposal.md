# Proposal: weekly-planner

## Why

Cooking decisions happen a week at a time, not a meal at a time. What
Can I Cook answers "tonight"; nothing answers "what should this week
look like, given what's in the pantry and what's about to expire".

## What Changes

A new **Planner** view (`/planner`, nav entry between Recipes and
Inventory): a Monday–Sunday grid of planned entries (recipe + portions
per day, week-navigable), stored planner-side. Its suggestion panel runs
the EXISTING cookability engine against the pantry MINUS everything
already planned this week — suggestions shrink as the week fills — and
boosts recipes that use expiring/expired pantry items to the top.

What Can I Cook stays exactly as is (the instant query); the planner
reuses its machinery, not its page.

## What it is NOT (v1)

No meal slots (breakfast/lunch/dinner) — a day is a list. No auto-cook:
cooking a planned entry goes through the recipe page's existing cook
flow. No service involvement — plans are intentions, not consumption.

## Impact

Migration 0009 (`plan_entry`), `domain/planner.ts` (week math, plan
depletion via the cook-consumption planner, suggestion assembly), repo +
facade + two actions, the view + components, nav update (pinned specs
touched deliberately).
