## ADDED Requirements

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
