## ADDED Requirements

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
