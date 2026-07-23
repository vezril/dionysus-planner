# recipe-authoring

## Requirements

### Requirement: typed Cooklang-inspired mention grammar
A recipe's body SHALL be authored as a single free-text field containing inline ingredient mentions of the form `@Name(id)` optionally followed by `{quantity%unit}` (or `{quantity}` for a COUNT-class implicit "each"). Every mention SHALL carry a quantity; a mention with no `{...}` block is a validation error, not silently accepted.

#### Scenario: a mention with mass units parses
- **WHEN** a recipe body contains `@Olive oil(7){2%tbsp}`
- **THEN** parsing yields one line with `ingredientId: 7`, `quantity: 2`, `unit: "tbsp"`

#### Scenario: a bare-count mention parses
- **WHEN** a recipe body contains `@Egg(12){2}`
- **THEN** parsing yields one line with `ingredientId: 12`, `quantity: 2`, `unit` resolving to the COUNT class's canonical unit

#### Scenario: a mention with no quantity block is rejected
- **WHEN** a recipe body contains `@Salt(3)` with no `{...}` following it
- **THEN** saving is blocked with a validation error and no recipe is written

#### Scenario: names containing commas parse correctly
- **WHEN** a recipe body contains `@Onion, yellow, medium(42){1}`
- **THEN** the full name including its commas is captured and the mention resolves to ingredient id `42`

### Requirement: mention identity is captured by explicit selection, never inferred from text
The catalog ingredient ID embedded in a mention SHALL only ever be produced by an explicit autocomplete selection at authoring time (backed by the existing ingredient search endpoint). The parser SHALL NOT perform name-based or fuzzy matching to resolve a mention to a catalog row.

#### Scenario: typing `@` opens a linked search
- **WHEN** the user types `@` followed by a search query in the editor
- **THEN** a dropdown of matching catalog ingredients appears, sourced from the same search the ingredient catalog page uses

#### Scenario: an unlinked `@` is left as plain text
- **WHEN** the user types a bare `@` that is never resolved via the autocomplete (no `(id)` follows)
- **THEN** it is not treated as a mention and does not appear in the parsed lines or block saving

### Requirement: parsed lines feed the existing recipe write path unchanged
The parsed `{ingredientId, quantity, unit}` lines SHALL be passed into the existing canonical-conversion and transactional write path (`toLineInputs`, `createWithLines`/`updateWithLines`) with no changes to that path, the database schema, or the matching/nutrition engines.

#### Scenario: a recipe with two mentions of the same ingredient still sums for matching
- **WHEN** a recipe body mentions the same ingredient ID in two separate places with two quantities
- **THEN** both are persisted as separate recipe lines, and cookability matching sums them exactly as it already does for any duplicate-ingredient lines

#### Scenario: a mention referencing a nonexistent ingredient ID fails cleanly
- **WHEN** a mention's `(id)` does not correspond to any catalog ingredient
- **THEN** the save fails with a clean validation/error response and no partial recipe is written (same FK-violation handling already in place)

### Requirement: at least one mention required to save
A recipe body containing zero successfully parsed mentions SHALL block saving with an inline validation message, mirroring the existing "at least one ingredient" rule.

#### Scenario: an empty or mention-free body is rejected
- **WHEN** the body contains no `@Name(id){...}` mentions at all
- **THEN** saving is blocked and the recipe is not created or updated

### Requirement: read-only views never display the raw ID annotation
Any read-only rendering of a recipe body SHALL strip the `(id)` annotation from each mention before display.

#### Scenario: recipe detail page shows clean prose
- **WHEN** the recipe detail page renders a body containing `@Onion, yellow, medium(42){1}`
- **THEN** the displayed text reads `@Onion, yellow, medium{1}` with no visible numeric ID

### Requirement: existing recipes round-trip without reconstruction
Reopening a previously saved recipe for editing SHALL populate the editor directly from the stored annotated body text, without needing to reconstruct it from `recipe_line` rows.

#### Scenario: editing a saved recipe pre-fills the exact stored text
- **WHEN** an existing recipe is opened in edit mode
- **THEN** the textarea is pre-filled with the recipe's stored body text, mentions and annotations intact

### Requirement: cookware and timer syntax are not parsed
Standard Cooklang cookware (`#tool{}`) and timer (`~{duration}`) tokens SHALL NOT be parsed, tracked, or given any special meaning in this version — they are treated as plain text if present.

#### Scenario: cookware/timer tokens are inert
- **WHEN** a recipe body contains `#pot{}` or `~{10%minutes}`
- **THEN** neither produces a recipe line, an error, or any stored side effect beyond appearing as literal text
