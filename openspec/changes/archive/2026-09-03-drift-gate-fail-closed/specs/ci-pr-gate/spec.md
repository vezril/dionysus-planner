# Delta: ci-pr-gate (drift-gate-fail-closed)

## MODIFIED Requirements

### Requirement: The OpenAPI drift gate fails closed

The gate SHALL detect route handlers by importing each `app/api/**`
`route.ts` module and inspecting which HTTP-method names it exports as
functions — never by matching source text, so a handler's declaration
style cannot silence it. Every route file SHALL yield at least one
detected handler; a file yielding none SHALL fail the suite rather than
pass silently. The gate SHALL continue to reject documented paths with
no route file, and an Insomnia collection missing any documented
operation. The gate verifies that an operation EXISTS and is exported,
not that the spec describes its parameters, statuses, or schemas
correctly.

#### Scenario: A handler is rewritten as a wrapped const

- **GIVEN** a route that exports `const GET = withRouteLog(...)` instead
  of `async function GET`
- **THEN** the gate still detects GET and still requires it documented

#### Scenario: Detection breaks entirely

- **WHEN** no handler can be detected in a route file
- **THEN** the suite fails naming that file, rather than reporting zero
  undocumented operations and passing
