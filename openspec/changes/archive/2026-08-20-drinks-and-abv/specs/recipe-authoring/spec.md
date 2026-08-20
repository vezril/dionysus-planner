## ADDED Requirements

### Requirement: Recipes with alcohol show an estimated ABV
The recipe detail page SHALL show an estimated ABV when the recipe's
ingredients contribute alcohol and at least part of the recipe resolves
to a volume: ABV% = (total alcohol grams ÷ 0.789) ÷ total resolvable
volume in mL × 100, labeled as an estimate. Lines without a recorded
alcohol value contribute zero alcohol; lines that cannot resolve to a
volume contribute no volume. Recipes with no alcohol show nothing new.

#### Scenario: A cocktail
- **WHEN** a recipe combines 45 mL of a spirit at 33.5 g alcohol per 100 mL with 120 mL of juice (no alcohol recorded)
- **THEN** the detail page shows an ABV of ≈11.6% marked as an estimate

#### Scenario: Food recipes unchanged
- **WHEN** no ingredient has alcohol recorded
- **THEN** no ABV renders
