## ADDED Requirements

### Requirement: Products may declare their generic ingredient
A product SHALL optionally link to a generic ingredient (an ingredient
with no generic link of its own) of the SAME unit class, editable on
both entry forms and shown on the detail page. Linking to a product, a
different unit class, or a missing ingredient SHALL be rejected.
Deleting a generic still linked by products SHALL be refused with a
message naming the products.

#### Scenario: Two butters
- **WHEN** "Lactantia Butter" and "Kirkland Butter" both link to generic "Butter"
- **THEN** each detail page shows the generic and "Butter" cannot be deleted while they exist

### Requirement: Group stock is interchangeable for availability
Cookability, What Can I Cook, planner depletion, and the shopping list
SHALL treat a recipe line's available stock as the SUM over the line
ingredient's group (the generic and all products linked to it), with
lines normalized to the group so overlapping references aggregate
rather than double-count. Recipe nutrition display continues to use the
line's own ingredient.

#### Scenario: Recipe sees branded stock
- **WHEN** a recipe needs 200 g of generic "Butter" and the pantry holds two branded butters at 150 g each
- **THEN** the recipe is cookable and the shopping list wants nothing

### Requirement: Cooking asks which product is used
When a cook line's group has more than one stocked pantry row, the cook
dialog SHALL require selecting exactly which product is being used
before confirming; the selected row is consumed. One stocked row
behaves as before; zero behaves as missing.

#### Scenario: Which butter?
- **WHEN** a recipe line resolves to a group with two stocked butters and the user confirms the cook
- **THEN** confirmation is blocked until one butter is selected, and only the selected butter's pantry row is decremented
