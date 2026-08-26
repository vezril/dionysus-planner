## ADDED Requirements

### Requirement: A generic can be created from the product form
The Generic-of menu SHALL offer creating a new generic inline: the
product submit carries the generic's name, and the server reuses an
existing same-unit-class generic with that exact name
(case-insensitive) or creates one seeded with the product's resolved
nutrition, then links the product to it.

#### Scenario: First beer in the pantry
- **WHEN** the user adds "Lagabière" picking "New generic…" named "Beer"
- **THEN** a "Beer" generic exists with the product's unit class and nutrition, and Lagabière links to it; a second product naming "beer" reuses it
