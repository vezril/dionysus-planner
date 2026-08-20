## ADDED Requirements

### Requirement: The detail page links to editing the item's details
`/pantry/{id}` SHALL provide an "Edit details" link to the ingredient edit form for the item's ingredient, where nutrition, name, and product identity are editable (existing form; seeded ingredients keep their override-on-edit semantics).

#### Scenario: Fixing a typo'd barcode from the pantry
- **WHEN** the user opens a custom item's detail page and clicks "Edit details"
- **THEN** the ingredient edit form opens prefilled, and saving a corrected barcode is reflected back on the detail page's product panel
