## ADDED Requirements

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
