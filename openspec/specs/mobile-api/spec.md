# mobile-api Specification

## Purpose
JSON surface for the Swift companion app.

## Requirements

### Requirement: JSON API for the mobile companion
The planner SHALL expose Node-runtime route handlers under /api/mobile:
GET pantry (rows incl. readyToEat/category), POST eat (quick-consume),
GET products?barcode= (404 when unknown) and POST products (create,
scanner flow), GET planner?weekStart= (defaults to the current week),
POST/DELETE planner-entries, GET log?date=, GET log-range?from&to, and
POST log-portion {batchId}. Handlers delegate to the existing actions
and facades — no parallel business logic — and carry no auth (private
network / tailnet only).

#### Scenario: Scanner flow
- **WHEN** the app GETs products with an unknown barcode and then POSTs a product with it
- **THEN** the first call returns 404 and the second creates the product so the next lookup returns it

### Requirement: Mobile consume of a planned entry

`POST /api/mobile/planner-entries/consume` SHALL accept `{id}` and run
the same consume transition as the web planner (service-first, entry-date
eatenAt, FIFO batch drain / pantry portion sizing, consumedAt mark),
returning 200 on success, 400 for validation failures (unknown id, wrong
kind, already consumed, future date, insufficient portions), and 502 when
the inventory service is unreachable. Planner week payloads SHALL include
each entry's `consumedAt` and per-row `plannedPortions` on ready-to-eat
batches. The route SHALL be documented in lib/openapi.ts with the
Insomnia collection regenerated.

#### Scenario: Consume from the phone

- **WHEN** POSTing a valid unconsumed eat_batch entry id
- **THEN** the meal is logged on the entry's date and the response
  carries the consumed entry

### Requirement: Pack size over the mobile surface

`POST /api/mobile/products` SHALL accept optional `packQuantity` and
`packUnit` (pack size requires its unit, mirroring the package pair
rule), documented in lib/openapi.ts with the Insomnia collection
regenerated. Product payloads returned by the mobile surface SHALL carry
the two fields.

#### Scenario: Scanner flow with packs

- **WHEN** the app creates a 366 g oatmeal box with packQuantity 61,
  packUnit "g"
- **THEN** the product saves both sizes and recipe/pantry pack
  affordances work for it
