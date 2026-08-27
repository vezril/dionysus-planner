# Delta: nutrition-guide (nutrition-intake)

## ADDED Requirements

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
