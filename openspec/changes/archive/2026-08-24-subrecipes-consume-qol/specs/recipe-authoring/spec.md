## ADDED Requirements

### Requirement: Recipes link to sub-recipes
Instructions MAY reference other recipes as `[[Name(id)]]`, authored by
typing `[[` for a recipe autocomplete. Read views SHALL render the
reference as a link to the sub-recipe; the backup markdown SHALL emit
it as an Obsidian `[[Name]]` link; the id annotation never shows.

#### Scenario: Cajun spice mix
- **WHEN** "Cajun chicken" references [[Cajun spice mix]] and the user clicks it
- **THEN** the sub-recipe's page opens, ready to cook
