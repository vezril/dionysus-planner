## ADDED Requirements

### Requirement: Alcohol is an optional tracked nutrient
Ingredients SHALL carry an optional alcohol value (grams per reference
quantity) with the same semantics as the existing optional nutrients:
null means not recorded (never zero), entry forms offer it alongside
fiber/sugar/sodium, nutrition-basis conversion scales it, detail pages
render it (or "not recorded"), and recipe totals include it only when
every constituent line's ingredient has it.

#### Scenario: Beer entered per can
- **WHEN** a VOLUME item is created with alcohol 14 g against a per-355 mL basis
- **THEN** the stored per-100 mL alcohol is ≈3.9437 g and the detail page shows it

#### Scenario: Absent stays absent
- **WHEN** an ingredient is saved without an alcohol value
- **THEN** its detail page shows "not recorded" for alcohol and recipe totals including it are incomplete for alcohol
