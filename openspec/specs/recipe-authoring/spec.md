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

### Requirement: Recipe view scales portions without persisting
The recipe detail page SHALL provide a portion slider (1 to 4× the
authored servings, defaulting to the authored servings) that linearly
rescales the displayed ingredient quantities and nutrition totals
client-side. Per-serving nutrition SHALL NOT change with the slider.
Stored recipe data SHALL NOT change. Incomplete (N/A) totals stay N/A.

#### Scenario: 4-portion recipe previewed at 6
- **WHEN** a recipe authored for 4 servings with a "2 cup" line is set to 6 portions
- **THEN** the line displays 3 cup and nutrition totals show 1.5× their authored values, while per-serving values are unchanged

#### Scenario: Default renders as today
- **WHEN** the page loads with the slider untouched
- **THEN** quantities and totals are identical to the pre-slider rendering

#### Scenario: Non-linear items scale linearly (documented v1 limit)
- **WHEN** a "1 each" COUNT line is scaled to 1.5×
- **THEN** it displays "1.5 each" — the exact linear value, never a silent rounding

### Requirement: A recipe can be deleted from its detail page
The recipe detail page SHALL provide the same confirm-dialog delete
affordance as the edit page: a destructive trigger opening a dialog with
exactly "Confirm delete" and "Cancel", where cancel closes without side
effects, success navigates to the recipe list, and failure (e.g. recipe
referenced by meals) surfaces the action's message inline.

#### Scenario: Delete from the view
- **WHEN** the user clicks Delete recipe on `/recipes/{id}` and confirms
- **THEN** the recipe is removed and the user lands on `/recipes` where the row is gone

#### Scenario: Cancel is a no-op
- **WHEN** the user opens the dialog and clicks Cancel
- **THEN** nothing is deleted and the user remains on the detail page

### Requirement: The recipe list always offers creation
`/recipes` SHALL render a "New recipe" link to `/recipes/new` in its
header regardless of how many recipes exist (the empty state keeps its
call-to-action too).

#### Scenario: Populated list
- **WHEN** recipes exist
- **THEN** the header shows a "New recipe" link to `/recipes/new`

### Requirement: Nutrition inputs state their unit
Every nutrition entry input SHALL carry its unit in the visible label —
Calories (kcal); Protein, Carbs, Fat, Fiber, Sugar, Alcohol (g); Sodium
(mg); Density (g/mL) — on the product form and the custom-item dialog.

#### Scenario: No unit ambiguity
- **WHEN** the user reaches the Sodium input on either form
- **THEN** its label reads "Sodium (mg)"

### Requirement: Recipes with alcohol show an estimated ABV
The recipe detail page SHALL show an estimated ABV when the recipe's
ingredients contribute alcohol and at least part of the recipe resolves
to a volume: ABV% = (total alcohol grams ÷ 0.789) ÷ total resolvable
volume in mL × 100, labeled as an estimate. Lines without a recorded
alcohol value contribute zero alcohol; lines that cannot resolve to a
volume contribute no volume. Recipes with no alcohol show nothing new.

#### Scenario: A cocktail
- **WHEN** a recipe combines 45 mL of a spirit at 33.5 g alcohol per 100 mL with 120 mL of juice (no alcohol recorded)
- **THEN** the detail page shows an ABV of ≈11.6% marked as an estimate

#### Scenario: Food recipes unchanged
- **WHEN** no ingredient has alcohol recorded
- **THEN** no ABV renders

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

### Requirement: Detail page highlights uncoverable ingredient lines
The recipe detail ingredient list SHALL badge lines the pantry cannot
cover at the authored servings — "missing from pantry" when no stock
exists in the line's generic group, "not enough in pantry" when stock
falls short — computed with the same grouped matching as the cook
preview. Covered lines carry no badge.

#### Scenario: Near-match recipe
- **WHEN** the user opens a recipe with one stocked and one unstocked ingredient
- **THEN** only the unstocked line is badged "missing from pantry"

### Requirement: Recipes link to sub-recipes
Instructions MAY reference other recipes as `[[Name(id)]]`, authored by
typing `[[` for a recipe autocomplete. Read views SHALL render the
reference as a link to the sub-recipe; the backup markdown SHALL emit
it as an Obsidian `[[Name]]` link; the id annotation never shows.

#### Scenario: Cajun spice mix
- **WHEN** "Cajun chicken" references [[Cajun spice mix]] and the user clicks it
- **THEN** the sub-recipe's page opens, ready to cook
