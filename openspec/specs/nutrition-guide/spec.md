# nutrition-guide

## Requirements

### Requirement: Nutrition targets are personal and adjustable
The app SHALL store per-nutrient daily targets (macros, sodium, sugar,
saturated fat, cholesterol, fiber, a weekly alcohol-unit cap, and
per-micronutrient goals), seeded from documented Canadian defaults and
editable on the Guide page. Every target is typed as a goal
(meet-or-exceed) or a cap (stay-under).

#### Scenario: Tune a target
- **WHEN** the user changes the sodium cap to 1500 and saves
- **THEN** every fit indicator immediately judges against 1500

### Requirement: The Guide explains and links its recommendations
`/guide` SHALL present a concise nutrition guide — calorie/macro
framing, fiber/sodium/sugar/saturated-fat guidance, the CCSA alcohol
risk tiers — citing its sources, alongside the targets editor.

#### Scenario: Alcohol tiers visible
- **WHEN** the user opens the Guide
- **THEN** the 0 / 1–2 / 3–6 / 7+ drinks-per-week risk tiers are shown

### Requirement: Recipes, days, weeks, and plans show target fit
Per-serving recipe nutrition SHALL show percent-of-daily-target; the
dashboard SHALL attach goal/cap status to its totals (exact for day and
week, per-logged-day average beyond, alcohol against the weekly cap);
the planner week SHALL compare planned calories against seven daily
calorie targets. Nutrients without data or without a target show no
judgment.

#### Scenario: A salty recipe
- **WHEN** a serving carries 1600 mg sodium against a 2300 mg cap
- **THEN** the per-serving row shows ~70% of the daily cap

#### Scenario: A heavy week
- **WHEN** the dashboard week shows 6 alcohol units against a 2-unit weekly cap
- **THEN** the alcohol total is marked over

### Requirement: Expanded micronutrient registry with DRI goals

The registry SHALL include biotin (µg), pantothenate (mg), iodine (µg),
selenium (µg), copper (mg), manganese (mg), chromium (µg), and
molybdenum (µg) alongside the existing 17 keys, each with an adult-male
Health Canada DRI goal default (biotin 30, pantothenate 5, iodine 150,
selenium 55, copper 0.9, manganese 2.3, chromium 35, molybdenum 45),
overridable per key on /guide like every other target. B-vitamin labels
SHALL lead with their common names (Thiamine, Riboflavin, Niacin,
Folate, with the B-number in parentheses). Every registry key SHALL have
a target default (a unit test enforces the pairing).

#### Scenario: New keys are enterable and targeted

- **WHEN** the product form, custom item dialog, or Targets editor
  renders its micronutrient section
- **THEN** all 25 keys appear with their labels and units, and /guide
  shows each with its DRI default until overridden
