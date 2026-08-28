# Delta: recipe-authoring (recipe-links-precision)

## ADDED Requirements

### Requirement: Recipe ingredient rows link to the product

Each ingredient row on a recipe's detail page SHALL link to that
product's own page: `/pantry/<pantryItemId>` when the product is
currently stocked (the detail view carrying nutrition facts, freshness,
and purchase history), otherwise `/ingredients/<id>/edit` (the catalog
record). The link SHALL NOT interfere with the portion slider, the
unresolved marker, or the missing/short pantry badges on the same row.

#### Scenario: Stocked ingredient

- **GIVEN** a recipe line whose product has a pantry row
- **WHEN** the ingredient name is clicked
- **THEN** the browser lands on that pantry item's detail page

#### Scenario: Unstocked ingredient

- **GIVEN** a recipe line whose product is not in the pantry
- **WHEN** the ingredient name is clicked
- **THEN** the browser lands on the product's catalog record
