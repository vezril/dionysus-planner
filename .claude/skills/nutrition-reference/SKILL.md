---
name: nutrition-reference
description: Canadian-oriented nutrition reference for Dionysus — DRI/target values, CCSA alcohol risk tiers, goal-vs-cap fit semantics, and how they map onto the planner's data model. Load before building or tuning any nutrition-recommendation feature.
---

# Nutrition reference (Dionysus)

Authoritative defaults for the planner's adjustable nutrition targets.
Canadian sources preferred (Calvin is in Quebec). Values are ADULT
GENERIC defaults — the whole point of the targets table is that Calvin
tunes them; never hard-code these outside `domain/nutritionTargets.ts`.

## Daily targets (defaults)

| Key | Default | Kind | Basis |
|---|---|---|---|
| caloriesKcal | 2500 | cap (budget) | typical adult male maintenance; personal |
| proteinG | 65 | goal | RDA 0.8 g/kg (~80 kg); athletes often 1.2–2.0 g/kg |
| carbsG | 300 | cap | AMDR 45–65 % of kcal |
| fatG | 80 | cap | AMDR 20–35 % of kcal |
| fiberG | 38 | goal | AI men 19–50 (30 g at 51+; women 25 g) |
| sugarG | 60 | cap | free sugars < 10 % kcal (WHO / Canada's Food Guide) |
| saturatedFatG | 25 | cap | < 10 % of kcal |
| sodiumMg | 2300 | cap | Health Canada / NASEM CDRR |
| cholesterolMg | 300 | cap | conventional guidance; no formal DRI |
| alcoholUnitsWeek | 2 | cap | CCSA low-risk line (see below) |

Trans fat: no numeric target — guidance is "as low as possible".

## Micronutrient daily goals (adult male defaults; registry keys)

vitaminA 900 µg RAE · vitaminC 90 mg · vitaminD 15 µg (600 IU) ·
vitaminE 15 mg · vitaminK 120 µg · vitaminB1 (Thiamine) 1.2 mg ·
vitaminB2 (Riboflavin) 1.3 mg · vitaminB3 (Niacin) 16 mg ·
vitaminB6 1.3 mg · vitaminB9 (Folate) 400 µg DFE · vitaminB12 2.4 µg ·
calcium 1000 mg (1200 at 70+) · iron 8 mg (women 19–50: 18 mg) ·
magnesium 420 mg · potassium 3400 mg AI · zinc 11 mg ·
phosphorus 700 mg · pantothenate (B5) 5 mg AI · biotin (B7) 30 µg AI ·
iodine 150 µg · selenium 55 µg · copper 0.9 mg · manganese 2.3 mg AI ·
chromium 35 µg AI · molybdenum 45 µg. All are GOALS (meet-or-exceed),
keys match `domain/micronutrients.ts` MICRONUTRIENTS.

## Alcohol — Canada's Guidance on Alcohol and Health (CCSA, 2023)

Weekly STANDARD DRINKS (1 unit = 17 mL ethanol, the CRDM definition the
app already implements as grams ÷ 0.789 ÷ 17):
- 0/week — no risk
- 1–2/week — LOW risk
- 3–6/week — MODERATE risk (breast/colon cancer risk rises)
- 7+/week — INCREASINGLY HIGH risk
- Never more than 2 on any single day; the old 10–15/week guidance is obsolete.

## Fit semantics (how the app judges)

- **cap** (budget/limit): ok ≤ 90 % of target · near 90–100 % · over > 100 %.
- **goal** (meet-or-exceed): met ≥ 100 % · partial 60–100 % · low < 60 %.
- Period scaling: day ×1, week ×7; longer periods compare the PER-LOGGED-DAY
  average against the daily target (a half-logged month must not look
  under-target). alcoholUnitsWeek is inherently weekly — exact on the week
  view, per-week average elsewhere.
- Never invent a status for a nutrient with no recorded data — omit.

## Data-model mapping

- Planner stores per-REFERENCE nutrition (100 g / 100 mL / 1). Daily
  intake comes from the SERVICE day logs (`/api/log/{date}`, `/api/log/range`).
- Alcohol grams ride the mirror's micronutrient map as `alcoholG`;
  saturated fat/trans fat/cholesterol as `saturatedFatG`/`transFatG`/
  `cholesterolMg`.
- Targets live planner-side in `nutrition_target(key, value)` — merged
  over these defaults, edited on `/guide`.

## Sources

- CCSA, Canada's Guidance on Alcohol and Health (2023): https://www.ccsa.ca/en/guidance-tools-resources/substance-use-and-addiction/alcohol/canadas-guidance-alcohol-and-health
- Health Canada DRI tables: https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables.html
- Health Canada DRI calculator: https://health-infobase.canada.ca/nutrition/dietary-reference-intakes-calculator/
