## ADDED Requirements

### Requirement: Batch nutrition follows the ingredients actually used
The cook flow SHALL build the service recipe mirror from the actually
used ingredient per line — the picked product, the substitute (at its
entered quantity in authored basis), or the authored ingredient for
defaults and ignored lines — and SHALL reuse a service recipe only when
both its name AND its line signature match, creating a variant recipe
otherwise. Batches therefore carry the nutrition of what was really
cooked.

#### Scenario: Kirkland vs Lactantia
- **WHEN** the same recipe is cooked twice, once picking each butter with different nutrition
- **THEN** two service recipes exist and each batch's per-serving nutrition reflects its butter

#### Scenario: Identical repeat reuses
- **WHEN** a cook repeats a previous cook's exact ingredient set
- **THEN** no new service recipe is created
