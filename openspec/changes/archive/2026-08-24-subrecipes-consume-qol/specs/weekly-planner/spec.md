## ADDED Requirements

### Requirement: Immediate consumption lands on the plan
Cooking with "Eating now" portions and the Inventory one-tap portion
log SHALL each record an eat_item plan entry on today for the consumed
portions, so all immediate consumption is accounted in the plan.

#### Scenario: Cook and eat two now
- **WHEN** the user cooks 4 portions eating 2 now
- **THEN** today's plan shows the recipe marked eaten for 2 portions
