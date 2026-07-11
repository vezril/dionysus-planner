# Seed Data Sources & Provenance (S-204)

`seed-data.json` contains 351 curated common home-cooking ingredients. All nutrition
values are transcribed from **USDA FoodData Central** (FDC, https://fdc.nal.usda.gov),
a work of the U.S. federal government and **public domain** — this file exists for
auditability (architecture §8, OQ-5), not legal necessity. Values were transcribed at
curation time; nothing in the app fetches data at build or run time (NFR-9, NG-6).

## seedKey convention

- `usda:<5-digit id>` — the row's USDA SR Legacy NDB number (e.g. `usda:01001`
  Butter, salted; `usda:20081` all-purpose flour; `usda:19335` granulated sugar).
  Numeric ids were used only where the curator was confident of the exact NDB number.
- `usda:<slug>` — a stable, human-readable slug for rows transcribed from USDA FDC
  (SR Legacy / Foundation / FNDDS survey entries) where the exact FDC id was not
  recorded during transcription. The slug is the permanent idempotency key; it never
  changes even if the name is edited (architecture §6 Flow A / §8).
- A handful of items with no clean generic FDC record (panko, pesto, alfredo-style
  items excluded; garam masala, Italian seasoning, almond milk, nutritional yeast,
  bouillon cube, some canned/deli goods) were transcribed from typical U.S. product
  **nutrition labels**, cross-checked against nearby FDC entries. These are flagged
  in "Known approximations" below.

## Reference basis (architecture §4 — the per-100g trap)

USDA FDC reports everything **per 100 g**. Rows were converted to the app's
per-unit-class basis at curation time:

| unitClass | Basis stored in file | Conversion applied |
|---|---|---|
| MASS | per 100 g | none (FDC values as-is) |
| VOLUME | per 100 mL | FDC per-100g × density (g/mL) |
| COUNT | per 1 each | FDC per-100g × (typical unit weight ÷ 100) |

Rounding: calories and sodium to whole numbers; protein/carbs/fat/fiber/sugar to 0.1.
Unknown optional values are `null` (never 0-filled).

## Densities (`densityGPerMl`)

Set for cross-measured staples (AC-3 list and beyond) so mass↔volume conversion
(FR-12) works out of the box; `null` elsewhere. Sources: USDA FDC household-measure
portion weights (e.g. 1 cup AP flour = 125 g → 0.53; 1 cup granulated sugar = 200 g
→ 0.85; 1 cup packed brown sugar = 220 g → 0.93; 1 tsp table salt = 6 g → 1.2;
1 cup rolled oats = 81 g → 0.34) and standard liquid specific gravities (water 1.0,
milk 1.03, oils 0.91–0.92, butter 0.955, honey 1.42, maple syrup 1.32, molasses 1.41,
soy sauce 1.15, vinegar 1.01, wine 0.99, broth 1.0). Condiment densities derive from
FDC tablespoon weights (ketchup 17 g/tbsp → 1.13, mayo 13.8 g/tbsp → 0.92, etc.).
Kosher salt density is intentionally `null`: it varies ~2× by brand (Diamond ≈ 0.57,
Morton ≈ 0.97), so no single value is safe.

## COUNT rows — assumed unit weights

Per-each values = FDC per-100g × the weight below (USDA "medium"/standard portion
weights). The assumed unit is part of the row name where ambiguous.

| Ingredient | g/each | Ingredient | g/each |
|---|---|---|---|
| Egg, large, whole | 50 | Apple, medium | 182 |
| Egg white, large | 33 | Banana, medium | 118 |
| Egg yolk, large | 17 | Orange, medium | 131 |
| Garlic, 1 clove | 3 | Lemon, medium | 58 |
| Onion, yellow/red, medium | 110 | Lime, medium | 67 |
| Green onion, 1 medium | 15 | Grapefruit, medium | 246 |
| Shallot, 1 medium | 30 | Mango, whole flesh | 336 |
| Carrot, medium | 61 | Peach, medium | 150 |
| Celery, 1 stalk | 40 | Pear, medium | 178 |
| Tomato, medium | 123 | Plum, 1 fruit | 66 |
| Tomato, roma | 62 | Kiwi, 1 fruit | 69 |
| Bell pepper, medium | 119 | Avocado, medium flesh | 150 |
| Jalapeno | 14 | White bread, slice | 26 |
| Serrano | 6 | Whole wheat bread, slice | 32 |
| Poblano | 45 | Bagel, plain | 105 |
| Cucumber, medium | 201 | Hamburger bun | 45 |
| Zucchini / yellow squash | 196 | Corn tortilla, 6-inch | 26 |
| Eggplant, medium | 458 | Flour tortilla, 8-inch | 45 |
| Leek, 1 medium | 89 | Pita, large | 60 |
| Fennel bulb, medium | 234 | Hot dog, beef frank | 45 |
| Artichoke, medium | 128 | Bouillon cube | 5 |
| Corn ear (kernels) | 90 | Russet potato, medium | 213 |
| Sweet potato, medium | 130 | | |

## Curation criteria (AC-6)

Chosen to cover what a home cook stocks and what the PRD's 10-reference-recipe test
needs: vegetables (60), fruits (31), proteins/meats/fish (38), dairy/eggs (33),
grains/pasta/bread (32), legumes (15), baking (16), oils/fats (9), condiments/sauces
(36), spices/herbs (41), nuts/seeds (18), broths/water (7), canned staples (15).
Raw/unprepared forms preferred (matching how pantry items are stored); canned/frozen
variants included where that is the common pantry form. PRD-named examples (green
onions, yellow onion, mustard, pasta, rice) are all present.

## Known approximations

Values expected to sit within the ±10% spot-check tolerance but transcribed with
lower confidence (label-derived or FDC-variant ambiguity): chicken wings/drumstick,
breakfast sausage, deli ham/turkey, bacon (raw), hard salami, pepperoni sodium,
beef chuck/ribeye/sirloin/flank cuts (trim-level dependent), firm tofu (brand water
content varies widely; SR "firm, calcium sulfate" record used), panko, pesto,
garam masala, Italian seasoning, almond milk, nutritional yeast, bouillon cube,
canned-bean drained values (brand dependent), feta/blue/American cheese sodium,
vegetable broth. The AC-4 manual 20-row spot-check should preferentially sample
outside this list or replace flagged rows if any fail.

## Spot-check (AC-4)

To be recorded here by the manual verification task: sample 20 random rows, compare
against their FDC source records, require ≥95% within rounding/±10%.
