## ADDED Requirements

### Requirement: Ready-to-eat products can be eaten straight from the pantry
Products SHALL have a ready-to-eat flag (checkbox on both forms; no
effect on recipe usability). A stocked ready-to-eat pantry row SHALL
offer an Eat action — quantity prefilled to 1 each (COUNT) or the
package size — that, service-first and all-or-nothing: logs a
direct-consumable service meal (mirroring the product as directly
loggable), consumes the pantry quantity, and records an eaten entry on
today's plan. A service failure consumes nothing.

#### Scenario: A can of beer, no recipe
- **WHEN** the user hits Eat on a ready-to-eat 355 mL-packaged beer and confirms
- **THEN** 355 mL leaves the pantry, today's day log gains the beer's nutrition, and today's plan shows the beer marked eaten
