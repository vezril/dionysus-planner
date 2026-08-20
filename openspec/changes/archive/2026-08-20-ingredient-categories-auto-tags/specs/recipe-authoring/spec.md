## ADDED Requirements

### Requirement: Recipes auto-derive tags from ingredient categories
A recipe SHALL automatically carry, as computed read-time tags, the
union of the categories of each line's ingredient and of that
ingredient's generic root. The recipe list SHALL show and filter on
manual and derived tags together; the detail page SHALL show derived
tags distinctly; the edit form SHALL contain only manual tags, and
derived tags are never persisted to `recipe_tag`.

#### Scenario: Salmon recipe
- **WHEN** a recipe includes a product whose generic has categories "fish" and "salmon"
- **THEN** the recipe list row shows tags fish and salmon and the tag filter matches them, without the tags appearing in the recipe's edit form
