# meal-log

## Requirements

### Requirement: A Meal Log section exists, backed by dionysus-service
`dionysus-planner` SHALL provide a "Meal Log" section (`/meal-log`) that reads and writes exclusively through `dionysus-service`'s HTTP API. It MUST NOT read or write `dionysus-planner`'s own SQLite database for any Meal Log data.

#### Scenario: Meal Log is reachable from navigation
- **WHEN** a user views the app's navigation
- **THEN** a "Meal Log" entry links to `/meal-log`

### Requirement: The day view shows a date's nutrition totals and contributing meals
`/meal-log` SHALL display, for a given date (defaulting to today), the day's total nutrition (including sodium) and the list of meals that contributed to it, sourced from `dionysus-service`'s `GET /api/log/{date}`.

#### Scenario: Viewing today's log with no meals yet
- **WHEN** a user visits `/meal-log` and no meals have been logged for today
- **THEN** the page shows zeroed totals (sodium included, not blank) and no meals listed

#### Scenario: Viewing a day with logged meals
- **WHEN** a user visits `/meal-log` for a date with two logged meals
- **THEN** the page shows the combined totals and both meals with their individual nutrition

### Requirement: A user can log a meal against an existing batch portion or a direct consumable
The Meal Log section SHALL provide a form to create a meal with one or more lines, each either a portion of an existing batch or a directly-loggable ingredient — matching `dionysus-service`'s `meal-logging` capability's own validation (over-portioning a batch, or logging a non-directly-loggable ingredient, are rejected and the rejection is shown to the user).

#### Scenario: Logging a batch portion
- **WHEN** a user selects an existing batch with remaining portions and specifies a portion amount within what remains, then submits
- **THEN** the meal is created and the user is shown confirmation reflecting the new meal's nutrition

#### Scenario: Over-portioning a batch is surfaced as an error, not silently dropped
- **WHEN** a user attempts to log more portions of a batch than remain
- **THEN** the form shows the rejection from `dionysus-service` and does not report success

#### Scenario: Logging a direct consumable
- **WHEN** a user selects an ingredient flagged `directlyLoggable` and a quantity, then submits
- **THEN** the meal is created with that line

### Requirement: A user can manage the dionysus-service ingredient catalog from within dionysus-planner
The Meal Log section SHALL provide a page to list and create `dionysus-service` ingredients (sodium required, `directlyLoggable` flag), distinctly labeled from `dionysus-planner`'s own `/ingredients` page so the two catalogs are never presented as the same thing.

#### Scenario: Creating an ingredient without sodium is rejected
- **WHEN** a user submits the Meal Log ingredient form without a sodium value
- **THEN** the form shows a validation error and no ingredient is created

### Requirement: A user can manage dionysus-service recipes from within dionysus-planner
The Meal Log section SHALL provide a page to list and create `dionysus-service` recipes as a flat list of ingredient-ID-referenced lines (name, servings, one or more `{ingredient, quantity, unit}` rows) — not the Cooklang mention editor, since this API has no free-text recipe body.

#### Scenario: Creating a recipe with zero lines is rejected
- **WHEN** a user submits the recipe form with no ingredient lines
- **THEN** the form shows a validation error and no recipe is created

### Requirement: A user can cook (create) a batch from a recipe
The Meal Log section SHALL provide a page to list existing batches (with computed remaining portions) and create a new batch by selecting a recipe and specifying `servingsMade` and `cookedAt`.

#### Scenario: Cooking a batch
- **WHEN** a user selects an existing recipe, sets `servingsMade`, and submits
- **THEN** a new batch is created and appears in the batch list with its remaining portions

### Requirement: dionysus-service unavailability is isolated to the Meal Log section
If `dionysus-service` is unreachable or returns an error, the Meal Log section SHALL show a clear error rather than crashing, and the rest of `dionysus-planner` (pantry, recipes, what-can-I-cook) SHALL remain fully functional.

#### Scenario: Service is down
- **WHEN** `DIONYSUS_SERVICE_URL` points at an unreachable host and a user visits `/meal-log`
- **THEN** the page shows a clear error message, and navigating to `/recipes` still works normally

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

### Requirement: Cook mirrors carry micronutrients to the meal service
When the cook flow creates a service ingredient mirror, it SHALL include
the planner ingredient's micronutrients converted to per-canonical-unit
amounts (amount ÷ reference quantity), so service-side recipe, meal, and
day-log rollups include them. Existing mirrors are not retro-updated
(reuse-by-name semantics unchanged).

#### Scenario: Cooking a vitamin-bearing recipe
- **WHEN** a recipe line's ingredient carries vitamin C 16.9014 mg per 100 mL and the mirror is first created
- **THEN** the service ingredient is created with micronutrients vitamin C ≈0.169014 per mL

### Requirement: The Meals day view shows micronutrient totals
The Meals day page SHALL render a Micronutrients list when the day's
total nutrition includes micronutrient keys — registry label and unit
where known, the raw key otherwise — and SHALL render nothing extra when
the map is empty or absent.

#### Scenario: Supplement day
- **WHEN** the day log's totals include `{"vitaminD": 25}`
- **THEN** the day view lists "Vitamin D 25 µg"

#### Scenario: No micronutrients, unchanged page
- **WHEN** the day's totals have no micronutrient keys
- **THEN** the page renders exactly as before this change

### Requirement: Cooking can log eaten-now portions in the same confirm
The cook dialog SHALL offer an "Eating now" portion count (0 to the
cooked count, defaulting to 1) and, when greater than zero, SHALL log a
meal of that many portions against the newly created batch after the
batch and pantry writes succeed. A meal-log failure after those writes
SHALL surface as a warning on an otherwise successful cook — never a
rollback. The batch's remaining portions reflect the eaten amount.

#### Scenario: Cook 4, eat 1
- **WHEN** the user cooks 4 portions with "Eating now" left at 1
- **THEN** a 4-portion batch exists with 3 remaining, and today's Meals view includes the 1-portion meal

#### Scenario: Eat-now zero changes nothing
- **WHEN** the user sets "Eating now" to 0 and confirms
- **THEN** the behavior is identical to the pre-change cook (batch only, no meal)

#### Scenario: Eat-now above the cooked count is rejected
- **WHEN** the request asks to eat 5 of a 4-portion cook
- **THEN** validation fails and nothing is written

### Requirement: One-click portion logging from a batch row
Each Meals › Batches row with at least one remaining portion SHALL offer
a control that logs exactly one portion of that batch as eaten now; the
row's remaining count updates, and failures render inline on the row.

#### Scenario: Leftover lunch
- **WHEN** the user clicks "Log 1 portion" on a batch with 3 remaining
- **THEN** a 1-portion meal is logged for now and the row shows 2 remaining

#### Scenario: Exhausted batch offers no control
- **WHEN** a batch has 0 portions remaining
- **THEN** its row renders no quick-log control
