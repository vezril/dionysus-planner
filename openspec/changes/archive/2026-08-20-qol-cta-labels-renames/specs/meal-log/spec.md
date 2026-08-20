## ADDED Requirements

### Requirement: The Inventory landing leads with what's ready to consume
The `/meal-log` landing SHALL render, in order: a "Ready to consume"
section listing every batch with remaining portions (name, remaining
count, the one-click portion log), then "Today's intake" (the existing
day totals, micronutrients, and meal list). When no batch has remaining
portions the first section shows an empty message; day-view behavior is
otherwise unchanged, including the date navigation.

#### Scenario: Frozen meals visible first
- **WHEN** a batch has 3 remaining portions
- **THEN** the landing lists it under Ready to consume with a Log 1 portion control, above today's totals

#### Scenario: Nothing ready
- **WHEN** no batch has remaining portions
- **THEN** the Ready to consume section shows an empty message and the day view renders as before
