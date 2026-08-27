# Delta: custom-pantry-items (pack-units)

## ADDED Requirements

### Requirement: Inner pack size on products

Products SHALL carry an optional inner pack size (packQuantity +
packUnit, migration 0019) alongside the outer package, editable in the
product form and the custom-item dialog; when both sizes are set the
form SHALL hint "≈ N packs per package". The Eat/Drink dialog SHALL
prefill one pack (falling back to the package, then blank), the pantry
Adjust menu SHALL offer a "−1 pack" preset when a pack size exists in
the row's unit class, and the consumption portion ladder SHALL become
1 each (COUNT) → one pack → one package → the 100 g/100 mL reference.

#### Scenario: Oatmeal box of six packs

- **GIVEN** a 366 g box with package 366 g and pack 61 g
- **WHEN** the Eat dialog opens or the planner consumes one planned
  portion
- **THEN** the prefilled/consumed quantity is 61 g, and Adjust's
  "−1 pack" drops the row from 366 g to 305 g
