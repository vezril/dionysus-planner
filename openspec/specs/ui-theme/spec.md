# ui-theme

## Requirements

### Requirement: dark-only cyberpunk token palette
The application SHALL render exclusively in the dark cyberpunk palette defined in the change design (near-black violet backgrounds, neon cyan primary, magenta accent), applied through the semantic token variables in `app/globals.css`. No light mode or theme toggle SHALL exist. Primary navigation SHALL be a persistent left sidebar (not a top bar), always visible with full labels at every viewport width, narrower on mobile than desktop.

#### Scenario: every view renders dark
- **WHEN** any primary view (Pantry, Recipes, recipe detail, Ingredients, What Can I Cook) is loaded
- **THEN** the page background resolves to the dark token value and no view renders a light background

#### Scenario: single palette source
- **WHEN** the palette needs adjustment later
- **THEN** changing the token values in `app/globals.css` propagates to all components without per-component edits

#### Scenario: sidebar always visible, no drawer
- **WHEN** any page loads at any viewport width, including 375px
- **THEN** the sidebar nav is visible with full text labels, with no toggle/hamburger control and no horizontal scroll on the page

#### Scenario: active route highlighted
- **WHEN** the user is on a given section (e.g. Pantry)
- **THEN** that section's sidebar link shows the active glow/highlight treatment and no other link does

### Requirement: semantic status colors
Cookability states SHALL use dedicated status tokens: acid green for cookable, amber for near-match, alarm red for destructive/missing states — consumed by the cookability badges, the What Can I Cook section accents, and shortfall text.

#### Scenario: badges reflect status semantics
- **WHEN** the recipe list renders cookability badges
- **THEN** COOKABLE badges use the cookable token, NEAR_MATCH the near token, and MISSING_MORE a muted/destructive treatment, each visually distinct at a glance

### Requirement: readability constraints survive the retheme
Body and functional text SHALL meet WCAG AA contrast (≥ 4.5:1) against its background, and all views SHALL remain usable at a 375px viewport (NFR-8). Fonts SHALL remain locally bundled (NFR-9).

#### Scenario: contrast verified
- **WHEN** the implemented token pairs (foreground/background, primary-foreground/primary, status text/card) are computationally checked
- **THEN** each functional-text pair reports ≥ 4.5:1

### Requirement: HUD numerics and glow conventions
Nutrition values, quantities, and shortfall figures SHALL render in the monospace font with tabular numerals. Neon glow effects SHALL appear only on: focus-visible states of interactive elements, status badges, card hover, and the active sidebar item — nowhere else.

#### Scenario: nutrition reads as a HUD
- **WHEN** a recipe detail page shows totals and per-serving values
- **THEN** the numeric values render in monospace with tabular alignment

#### Scenario: focus states glow
- **WHEN** any interactive element receives keyboard focus
- **THEN** a visible neon glow ring appears (serving as the focus indicator)

### Requirement: behavior and test surface unchanged
The retheme SHALL NOT alter any DOM structure, testid, accessible role/name, or runtime behavior. The complete existing test suite SHALL pass unmodified.

#### Scenario: suite stays green
- **WHEN** the full vitest and Playwright suites run against the rethemed app
- **THEN** all tests pass without any test-file changes

### Requirement: Sidebar order follows the data flow, Meals by name
The sidebar SHALL list, in order: What Can I Cook, Products, Pantry,
Recipes, Inventory. The catalog section SHALL be labeled "Products" (its
routes remain under `/ingredients`) and the consumption section
"Inventory" (its routes remain under `/meal-log`); nav labels and the
destination h1 headings match.

#### Scenario: Order and labels
- **WHEN** any page renders
- **THEN** the sidebar links appear in the order What Can I Cook, Products, Pantry, Recipes, Inventory, with `/ingredients` labeled "Products" and `/meal-log` labeled "Inventory"

#### Scenario: Nav label still equals the destination heading
- **WHEN** the user follows the "Products" or "Inventory" link
- **THEN** the destination h1 reads "Products" / "Inventory"

### Requirement: Pantry rows align as columns
On small-and-up viewports the pantry list SHALL render name, quantity,
freshness, and actions in fixed grid tracks so the columns align across
rows; narrow viewports keep a wrapping layout.

#### Scenario: Mixed rows
- **WHEN** rows with long names, out-of-stock badges, and freshness hints render together
- **THEN** quantities and action buttons line up vertically

### Requirement: Subtle logo watermark
Every page SHALL show the Dionysus logo as a fixed, centered background
watermark at low opacity, hidden from assistive tech and ignoring
pointer events.

#### Scenario: Non-distracting
- **WHEN** any page renders
- **THEN** the watermark sits behind content and captures no clicks

### Requirement: List columns sort on click
The pantry (Name / Quantity / Stocked), products (Name / Calories /
Category), and Inventory ready-to-consume (Name / Portions) lists SHALL
offer clickable column titles: first click sorts ascending, a second
click flips direction, the active column shows a direction indicator
and aria-sort, and strings compare case-insensitively with null values
last.

#### Scenario: Sort the pantry by quantity
- **WHEN** the user clicks the pantry's Quantity title twice
- **THEN** rows order by quantity ascending, then descending

### Requirement: Product list aligns as columns
On small-and-up viewports the products list SHALL render name, unit
class, calories, protein, carbs, fat, and badges in fixed grid tracks
with right-aligned tabular numerals, the sortable header aligned to
the same tracks; narrow viewports keep a wrapping layout.

#### Scenario: Mixed products
- **WHEN** rows with long names, drinks, and seeded items render together
- **THEN** every numeric column lines up vertically

### Requirement: Quantities display at most two decimals

Every rendered quantity, portion count, or on-hand amount SHALL pass
through `domain/quantityFormat.ts#formatQuantity`: at most two decimal
places, trailing zeros dropped, so float artifacts never reach the UI.
The helper is display-only and SHALL NOT be used in arithmetic that
feeds canonical storage or unit comparison. Nutrition values keep
`formatNutritionForDisplay`'s own rounding.

#### Scenario: A float artifact from pack subtraction

- **GIVEN** a pantry row holding 305.00000000000006 g after one pack
  was removed
- **THEN** the pantry list, its detail page, and the Eat dialog all
  render "305 g"

#### Scenario: A genuine fraction survives

- **GIVEN** 1.5 portions remaining on a batch
- **THEN** it renders "1.5", not "2" and not "1.50"
