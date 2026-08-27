# Delta: mobile-api (planner-consume)

## ADDED Requirements

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
