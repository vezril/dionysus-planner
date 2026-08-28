# Delta: ui-theme (recipe-links-precision)

## ADDED Requirements

### Requirement: Quantities display at most two decimals

Every rendered quantity, portion count, or on-hand amount SHALL pass
through `domain/quantityFormat.ts#formatQuantity`: at most two decimal
places, trailing zeros dropped, so float artifacts never reach the UI.
The helper is display-only and SHALL NOT be used in arithmetic that
feeds canonical storage or unit comparison. Nutrition values keep
`formatNutritionForDisplay`'s own rounding.

#### Scenario: A float artifact from pack subtraction

- **GIVEN** a pantry row holding 305.00000000000006 g after one pack
  was removed
- **THEN** the pantry list, its detail page, and the Eat dialog all
  render "305 g"

#### Scenario: A genuine fraction survives

- **GIVEN** 1.5 portions remaining on a batch
- **THEN** it renders "1.5", not "2" and not "1.50"
