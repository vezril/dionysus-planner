## ADDED Requirements

### Requirement: Product list aligns as columns
On small-and-up viewports the products list SHALL render name, unit
class, calories, protein, carbs, fat, and badges in fixed grid tracks
with right-aligned tabular numerals, the sortable header aligned to
the same tracks; narrow viewports keep a wrapping layout.

#### Scenario: Mixed products
- **WHEN** rows with long names, drinks, and seeded items render together
- **THEN** every numeric column lines up vertically
