## ADDED Requirements

### Requirement: Pantry rows know when they were stocked
Each pantry row SHALL carry a stocked-at timestamp, set on creation and
reset whenever its quantity increases (restock/increment/replace/upward
edit); quantity decreases SHALL NOT change it. The pantry list SHALL
show how long ago each row was stocked; the detail page shows the date.

#### Scenario: Consuming keeps the clock
- **WHEN** a row stocked 5 days ago is partially consumed by cooking
- **THEN** it still reads as stocked 5 days ago

#### Scenario: Restocking resets the clock
- **WHEN** more stock is added to an existing row
- **THEN** the row reads as stocked today

### Requirement: Shelf life turns age into expiry hints
Products SHALL accept an optional shelf life in days. When set, pantry
rows with stock SHALL show an expiry estimate (stockedAt + shelf life):
an "expiring" indicator within 3 days of the estimate and an "expired"
indicator past it. Rows without a shelf life show age only — never a
guessed expiry.

#### Scenario: Milk about to turn
- **WHEN** milk has shelf life 14 and was stocked 12 days ago
- **THEN** its pantry row shows an expiring indicator (~2 days left)

#### Scenario: Expired
- **WHEN** the estimate is in the past
- **THEN** the row shows an expired indicator

#### Scenario: No shelf life, no guess
- **WHEN** a product has no shelf life
- **THEN** its row shows only how long ago it was stocked
