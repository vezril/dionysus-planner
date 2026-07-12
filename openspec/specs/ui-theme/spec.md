# ui-theme

## Requirements

### Requirement: dark-only cyberpunk token palette
The application SHALL render exclusively in the dark cyberpunk palette defined in the change design (near-black violet backgrounds, neon cyan primary, magenta accent), applied through the semantic token variables in `app/globals.css`. No light mode or theme toggle SHALL exist.

#### Scenario: every view renders dark
- **WHEN** any primary view (Pantry, Recipes, recipe detail, Ingredients, What Can I Cook) is loaded
- **THEN** the page background resolves to the dark token value and no view renders a light background

#### Scenario: single palette source
- **WHEN** the palette needs adjustment later
- **THEN** changing the token values in `app/globals.css` propagates to all components without per-component edits

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
Nutrition values, quantities, and shortfall figures SHALL render in the monospace font with tabular numerals. Neon glow effects SHALL appear only on: focus-visible states of interactive elements, status badges, and card hover — nowhere else.

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
