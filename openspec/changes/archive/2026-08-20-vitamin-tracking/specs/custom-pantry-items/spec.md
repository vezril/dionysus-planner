## ADDED Requirements

### Requirement: Ingredients carry sparse micronutrient values
Ingredients SHALL support zero or more micronutrient values from a
versioned domain registry (vitamins A, C, D, E, K, B1, B2, B3, B6, B9,
B12; calcium, iron, magnesium, potassium, zinc — each with a fixed label
unit), stored per reference quantity in a sparse table keyed by
(ingredient, nutrient). Entry forms SHALL offer repeatable
nutrient-select + amount rows (duplicates rejected), nutrition-basis
conversion SHALL scale the amounts, and the pantry detail page SHALL
render only the nutrients present. Extending the registry SHALL NOT
require a schema migration.

#### Scenario: Vitamin D supplement as a COUNT item
- **WHEN** a COUNT custom item "Vitamin D3" is created with micronutrient vitamin D 25 µg per 1
- **THEN** its detail page shows "Vitamin D 25 µg" and no other micronutrient rows

#### Scenario: Basis conversion scales micronutrients
- **WHEN** a VOLUME item is created per-355 mL with vitamin C 60 mg
- **THEN** the stored per-100 mL vitamin C is ≈16.9014 mg

#### Scenario: Duplicate nutrient rejected
- **WHEN** the form submits two rows for the same nutrient
- **THEN** validation fails with a field error and nothing is saved

#### Scenario: No micronutrients, no section
- **WHEN** an ingredient has no micronutrient rows
- **THEN** its detail page renders no Micronutrients section
