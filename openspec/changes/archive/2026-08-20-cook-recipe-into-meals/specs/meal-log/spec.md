## ADDED Requirements

### Requirement: A recipe can be cooked into a service batch at the chosen portion count
The recipe detail page SHALL provide a Cook action that, at the portion
slider's current count N, creates a service Batch of N portions against a
mirrored service recipe (mirror matched by exact name, created on first
cook; ingredients mirrored per canonical unit). Meals themselves remain
logged through the existing Meals flow.

#### Scenario: Cook 6 portions of a 4-serving recipe
- **WHEN** the user sets the slider to 6 and confirms the cook dialog
- **THEN** a batch with servingsMade 6 appears under Meals › Batches, and per-portion nutrition equals the recipe's authored per-serving values

#### Scenario: Second cook reuses the mirror
- **WHEN** the same recipe is cooked again
- **THEN** no duplicate service recipe or ingredients are created — only a new batch

### Requirement: Cooking consumes pantry stock with per-line escape hatches
Confirming a cook SHALL decrement, in one local transaction, each
consumed line's scaled requirement from its pantry row (resolved into the
row's own unit basis; decrements floor at zero and a shortfall is flagged,
never an error). Lines that are missing from the pantry or unresolvable
SHALL require an explicit per-line choice before confirming: ignore (no
consumption) or substitute (consume a chosen pantry item and quantity
instead). The service write happens before any pantry decrement; a service
failure consumes nothing.

#### Scenario: Stock is consumed
- **WHEN** a line needs 300 mL and the pantry row holds 355 mL
- **THEN** after cooking the row holds 55 mL

#### Scenario: Shortfall consumes to zero, flagged
- **WHEN** a line needs 400 mL and the pantry row holds 355 mL
- **THEN** the row drops to 0, and the result summary flags the 45 mL shortfall

#### Scenario: Missing line ignored
- **WHEN** a line's ingredient has no pantry row and the user picks Ignore
- **THEN** the cook proceeds and no pantry row is touched for that line

#### Scenario: Missing line substituted
- **WHEN** the user substitutes 200 g of another pantry item for a missing line
- **THEN** that pantry item is decremented by 200 g and the original line consumes nothing

#### Scenario: Service down consumes nothing
- **WHEN** dionysus-service is unreachable at confirm time
- **THEN** the action returns a service error and every pantry row is unchanged
