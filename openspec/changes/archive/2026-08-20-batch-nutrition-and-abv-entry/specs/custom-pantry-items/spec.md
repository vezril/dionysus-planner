## ADDED Requirements

### Requirement: Volume drinks enter alcohol as percent ABV
On both entry forms, a VOLUME-class product with category DRINK SHALL
offer "Alcohol (% ABV)" (0–100) instead of grams; the value is stored as
alcohol grams per 100 mL via ethanol density (ABV × 0.789), is NOT
scaled by the nutrition basis (a ratio), and is converted back for edit
prefill. Non-drink or non-volume products keep gram entry. The detail
page shows the derived ABV alongside the grams for such items.

#### Scenario: A 5% beer
- **WHEN** a VOLUME Drink is saved with 5% ABV against a per-355 mL basis
- **THEN** the stored alcohol is 3.945 g per 100 mL (basis-independent) and the detail page shows "(5% ABV)"

#### Scenario: ABV on a non-volume item is rejected
- **WHEN** ABV is submitted for a MASS product
- **THEN** validation fails on the ABV field
