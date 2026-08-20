## ADDED Requirements

### Requirement: Recipes can be rated 1–5 stars
The recipe detail page SHALL offer a 1–5 star control: clicking a star
sets the rating, clicking the current rating clears it, and list rows
show the rating.

#### Scenario: Rate and clear
- **WHEN** the user clicks star 4 on a recipe, then clicks star 4 again
- **THEN** the recipe shows 4 stars after the first click and no rating after the second

### Requirement: Variations are linked recipes
"Create variation" SHALL duplicate a recipe (lines and manual tags) as
a new recipe whose variantOfId points at the ROOT recipe (a variation
of a variation links to the same root), opening the copy's edit page.
The root's detail page lists its variations, a variation links back to
its root, and list rows carry a "variation of" note.

#### Scenario: Spicy chili
- **WHEN** the user creates a variation of "Chili", renames it "Chili, spicy", and creates a variation of THAT
- **THEN** both variations link to "Chili" and its detail page lists both
