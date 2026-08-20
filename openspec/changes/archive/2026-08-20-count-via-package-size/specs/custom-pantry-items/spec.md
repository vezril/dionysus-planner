## ADDED Requirements

### Requirement: Count entries resolve against packaged items via package size
When comparing quantities between COUNT and a MASS or VOLUME class, and the
ingredient has a package size whose unit class equals the non-COUNT side,
the system SHALL resolve using `1 each = ⟨packageQuantity packageUnit⟩`, in
both directions, everywhere unit resolution occurs (cookability matching,
what-can-I-cook, recipe nutrition). Without a usable package size the
comparison SHALL remain unresolved — never a guess.

#### Scenario: A can in a recipe
- **WHEN** a recipe line says "2 each" of a VOLUME ingredient packaged as 355 mL
- **THEN** the line resolves to 710 mL — nutrition and matching both use it

#### Scenario: Grams of a counted package
- **WHEN** a recipe line says "100 g" of a COUNT ingredient packaged as 200 g
- **THEN** the line resolves to 0.5 each

#### Scenario: Pantry stock counted in cans
- **WHEN** the pantry holds "1 each" of that 355 mL VOLUME ingredient and a recipe needs 300 mL
- **THEN** cookability treats the stock as 355 mL and the recipe is cookable

#### Scenario: No package size, still unresolved
- **WHEN** a COUNT line references a VOLUME ingredient with no package size (or a package unit that is not a known unit key)
- **THEN** the line is unresolved, exactly as before

### Requirement: Package unit is a known unit key
Entry forms SHALL offer the package unit as a selection of known unit keys
(any class), and validation SHALL reject a package unit that is not a known
unit key. Existing stored values that case-insensitively match a known key
SHALL be normalized to it by migration; values that match nothing behave as
no package size.

#### Scenario: Legacy lowercase value
- **WHEN** the database holds packageUnit "ml" from before this change
- **THEN** after migration it reads "mL" and activates package-size resolution
