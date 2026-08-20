## ADDED Requirements

### Requirement: Read-only recipe views hide all mention syntax
The recipe detail's instructions SHALL render mentions as the bare
ingredient name — no `@`, no id, no quantity braces; surrounding prose
is untouched. Quantities appear only in the ingredient list, which reads
quantity-first: "⟨quantity⟩ ⟨unit⟩, ⟨name⟩".

#### Scenario: Prose stays prose
- **WHEN** the stored body is "Mince @Garlic powder(3){2%g} and serve."
- **THEN** the instructions read "Mince Garlic powder and serve."

#### Scenario: Quantity-first list
- **WHEN** a line is 1 tsp of Paprika
- **THEN** its list row reads "1 tsp, Paprika"
