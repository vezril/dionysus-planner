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
