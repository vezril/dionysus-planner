## ADDED Requirements

### Requirement: Cooking scales to 24 portions
The recipe portion slider SHALL range to at least max(4 × servings, 24).

#### Scenario: A case of beer
- **WHEN** a 1-serving recipe's slider is dragged to its maximum
- **THEN** 24 portions can be selected and cooked

### Requirement: Ready-to-consume batches merge per recipe
The Inventory landing's ready-to-consume list and the planner's
ready-to-eat group and picker SHALL show ONE row per recipe with the
summed remaining portions of all its batches; one-click logging and
batch plan entries SHALL target the oldest batch that still has
portions. The Batches admin page keeps per-batch rows.

#### Scenario: Two cooks, one row
- **WHEN** the same recipe is cooked twice at 4 portions each
- **THEN** ready-to-consume shows one row with 8 portions, and logging drains the older batch first
