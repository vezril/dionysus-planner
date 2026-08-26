## ADDED Requirements

### Requirement: Categories carry optional nutrition defaults
A category path MAY store optional per-100 g/mL nutrition (calories,
protein, carbs, fat, % ABV), editable from the products category tree
(set and clear). When a product is created with categories, EMPTY
nutrition fields SHALL prefill from the deepest matching category path
(exact before ancestor, first-listed category on ties,
case-insensitive), with a visible note; user-typed values are never
overwritten.

#### Scenario: New rhum bottle
- **WHEN** "Rhum/Lightly Aged Pot Rhum" has defaults (231 kcal, 40 % ABV) and the user creates a product with that category leaving calories blank
- **THEN** calories and ABV prefill from the category and the form notes the source
