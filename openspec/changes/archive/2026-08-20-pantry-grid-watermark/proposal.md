# Pantry column alignment + logo watermark

## Why
Pantry rows are justify-between flex, so quantity/freshness/actions
drift per row instead of lining up as columns. And the user wants the
Dionysus logo faintly in the background without distracting.

## What Changes
- Pantry rows become a fixed-track grid on sm+ (name 1fr, quantity
  right-aligned fixed, freshness fixed, actions right) so columns align
  across rows; small screens keep the wrapping flex layout.
- A fixed, centered, aria-hidden logo watermark (~4% opacity, pointer
  events off, negative z) behind all pages.

## Impact
PantryRow.tsx, app/layout.tsx, light e2e (watermark present), gate,
train v2.31.0.
