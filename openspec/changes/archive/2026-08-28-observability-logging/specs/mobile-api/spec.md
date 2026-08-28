# Delta: mobile-api (observability-logging)

## ADDED Requirements

### Requirement: Every HTTP handler logs its request

Each `app/api/**` route handler SHALL emit exactly one `http.request`
log line per invocation carrying method, path, status, and duration in
milliseconds — at info for 2xx/3xx, warn for 4xx, and error for 5xx or
an escaping exception (which is rethrown unchanged). Handlers SHALL
keep their `export async function <METHOD>` shape so the OpenAPI drift
gate continues to detect them. Request and response bodies SHALL NOT be
logged.

#### Scenario: A successful mobile read

- **WHEN** `GET /api/mobile/pantry` returns 200
- **THEN** one info line records method GET, that path, status 200, and
  a numeric durationMs

#### Scenario: A handler throws

- **WHEN** a handler raises
- **THEN** an error line records status 500 with the error's message,
  and the exception propagates unchanged
