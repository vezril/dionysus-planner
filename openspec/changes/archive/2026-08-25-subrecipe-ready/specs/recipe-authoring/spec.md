## ADDED Requirements

### Requirement: Sub-recipe links surface ready batches
When a referenced sub-recipe has remaining batch portions in Inventory,
its link on the parent's detail page SHALL carry an "N portions ready"
badge (summed across the sub-recipe's batches, matched via the service
mirror by name; absent when nothing remains or the service is down) —
signaling to use what's available instead of cooking again.

#### Scenario: Spice mix already made
- **WHEN** the user cooked "Cajun Spice Mix" (2 portions remain) and opens "Cajun Chicken"
- **THEN** the [[Cajun Spice Mix]] link shows "2 portions ready"
