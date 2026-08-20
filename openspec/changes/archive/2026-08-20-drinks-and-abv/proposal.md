# Proposal: drinks-and-abv

## Why

Calvin wants alcohol as a first-class beverage concept: prepackaged
drinks (a can of beer, a glass of wine, a shot) and cocktail recipes
whose ABV falls out of their ingredients. The data model already carries
alcohol grams and package sizes — what's missing is the category and the
ABV math.

## What Changes

1. **Category on products**: FOOD (default) | DRINK | SUPPLEMENT — a
   select on both entry forms, a badge on catalog rows and the pantry
   detail product panel. Migration 0007 (NOT NULL DEFAULT 'FOOD' — every
   existing row stays FOOD).
2. **Recipe ABV**: `domain/abv.ts` computes ABV% = (total alcohol g ÷
   0.789 g/mL ethanol) ÷ (total resolvable volume mL) × 100. Lines
   resolve to volume via the existing machinery (VOLUME direct, MASS via
   density, COUNT via package); lines with no recorded alcohol count as
   0 (an honest "at least" estimate — a cocktail's juice would otherwise
   block the number). Shown on the recipe detail ("~13% ABV, estimated")
   only when alcohol > 0 and some volume resolves.

## Impact

Column + migration, forms/badges, one pure domain function + display.
Prepackaged drinks need NOTHING new — a DRINK category item with alcohol
grams and a 355 mL package already logs through cook/eat-now/quick-log.
