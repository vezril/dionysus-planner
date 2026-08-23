## ADDED Requirements

### Requirement: Quick-consume can log to an earlier day
The Eat/Drink dialog SHALL offer a "Log to day" date (default today,
max today). A backdated consume logs the service meal at noon UTC of
that day and records the eat_item plan entry on that date; future
dates are rejected.

#### Scenario: Forgot yesterday's beer
- **WHEN** the user drinks a beer with the date set to yesterday
- **THEN** yesterday's day log gains the beer and yesterday's plan shows it (eaten), while the pantry decrements now
