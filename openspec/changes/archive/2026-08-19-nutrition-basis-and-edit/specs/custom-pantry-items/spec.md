## ADDED Requirements

### Requirement: Nutrition can be entered against any same-class basis
Nutrition-entry forms (the pantry "Create custom item" dialog, and the ingredient create/edit form) SHALL accept an optional nutrition basis — "per ⟨quantity⟩ ⟨unit⟩", defaulting to the reference basis (100 g / 100 mL / 1 count) — and the system SHALL convert the entered values to per-reference before persisting. Stored values remain per-reference; downstream consumers are unaffected.

#### Scenario: Soda can entered per 355 mL
- **WHEN** a VOLUME custom item is created with calories 150 entered against a basis of "per 355 mL"
- **THEN** the stored per-reference calories are 150 × (100 / 355) ≈ 42.2537, and the detail page's per-100 mL facts reflect that — no manual math

#### Scenario: Default basis behaves exactly as before
- **WHEN** the basis is left at its default
- **THEN** entered values persist unchanged (per-reference), identical to pre-change behavior

#### Scenario: Basis unit from the wrong class is rejected
- **WHEN** a MASS ingredient's nutrition is entered with a basis of "per 355 mL"
- **THEN** a field error on the basis unit is shown and nothing is saved — never a silent guess

#### Scenario: Count-class basis
- **WHEN** a COUNT item's nutrition is entered "per 2 each"
- **THEN** stored per-1 values are the entered values halved

### Requirement: Editing prefills per-reference values with the reference basis
The ingredient edit form SHALL prefill stored (per-reference) values with the reference basis selected. The system SHALL NOT reconstruct or imply the basis originally used at entry time.

#### Scenario: Editing a basis-entered item
- **WHEN** the soda from the first scenario is edited
- **THEN** the form shows ≈42.2537 against a "per 100 mL" basis
