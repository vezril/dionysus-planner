## ADDED Requirements

### Requirement: Products carry custom categories
Products and generics SHALL accept user-defined free-text categories
(comma-separated input on both product forms), stored as a replace-set
and round-tripped on edit.

#### Scenario: Tagging salmon
- **WHEN** the user saves a product named "Salmon, atlantic" with categories "fish, salmon"
- **THEN** both categories persist and reappear when editing the product
