## ADDED Requirements

### Requirement: Products carry a category
Every product SHALL have a category — FOOD (default), DRINK, or
SUPPLEMENT — selectable on both entry forms, editable, shown as a badge
on catalog rows and the pantry detail page. Existing rows default to
FOOD.

#### Scenario: A can of beer
- **WHEN** a beer is saved with category DRINK
- **THEN** its catalog row and detail page show a Drink badge

#### Scenario: Default unchanged
- **WHEN** a product is saved without touching the category
- **THEN** it is FOOD and renders exactly as before
