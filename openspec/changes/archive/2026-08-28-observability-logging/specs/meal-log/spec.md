# Delta: meal-log (observability-logging)

## ADDED Requirements

### Requirement: Outbound service calls and consumption decisions are logged

`services/dionysusService.ts#request` SHALL be the only place inventory
service calls are logged: `service.call` at debug on success and at warn
for a non-2xx, `service.unreachable` at error when the request never
completes — each with method, path, duration, and status or error where
known. The all-or-nothing consumption flows SHALL log their outcome:
a committed pantry consumption or planner consume at info (carrying the
entry/item id, the logged date, and whether it was backdated), and an
aborted one at error naming why nothing was consumed.

#### Scenario: The inventory service is down mid-consume

- **WHEN** a planned entry is consumed and the service is unreachable
- **THEN** `service.unreachable` logs at error, the flow logs its own
  abort, and no committed line is emitted — matching the fact that
  nothing was consumed and `consumedAt` stayed null
