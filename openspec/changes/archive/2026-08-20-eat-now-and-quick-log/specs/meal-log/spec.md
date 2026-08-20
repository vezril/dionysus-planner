## ADDED Requirements

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
