## ADDED Requirements

### Requirement: Saturated fat, trans fat, and cholesterol are optional tracked nutrients
Ingredients SHALL carry optional saturated fat (g), trans fat (g), and
cholesterol (mg) per reference quantity with the same semantics as the
existing optional nutrients (null = not recorded, unit-labeled entry on
both forms, basis conversion scales them, detail pages render them,
recipe totals complete only when every constituent has the value). Cook
mirrors SHALL forward them to the meal service via the micronutrient map
so day rollups include them, labeled correctly on the Inventory day view.

#### Scenario: Butter's label
- **WHEN** a MASS product is saved with saturated fat 51.4 g and cholesterol 215 mg per 100 g
- **THEN** its detail page shows both values and a recipe using it totals them

#### Scenario: Absent stays absent
- **WHEN** the three fields are left blank
- **THEN** detail pages show "not recorded" and recipe totals for them are incomplete

### Requirement: Phosphorus is a registry micronutrient
The micronutrient registry SHALL include phosphorus (mg), available in
the entry rows and rendered like any other micronutrient.

#### Scenario: Supplement with phosphorus
- **WHEN** a product records phosphorus 700 mg per reference
- **THEN** the detail page's micronutrients list shows "Phosphorus 700 mg"
