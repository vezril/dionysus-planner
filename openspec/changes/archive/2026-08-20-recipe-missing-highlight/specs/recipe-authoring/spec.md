## ADDED Requirements

### Requirement: Detail page highlights uncoverable ingredient lines
The recipe detail ingredient list SHALL badge lines the pantry cannot
cover at the authored servings — "missing from pantry" when no stock
exists in the line's generic group, "not enough in pantry" when stock
falls short — computed with the same grouped matching as the cook
preview. Covered lines carry no badge.

#### Scenario: Near-match recipe
- **WHEN** the user opens a recipe with one stocked and one unstocked ingredient
- **THEN** only the unstocked line is badged "missing from pantry"
