## ADDED Requirements

### Requirement: The API is self-documenting
The planner SHALL serve its OpenAPI 3.1 description at /api/openapi,
render it human-readably at /api-docs (linked from the Guide), and
offer a generated Insomnia collection; a test SHALL fail when any
route handler method is undocumented, a documented path has no
handler, or the collection misses an operation. CLAUDE.md SHALL be
maintained with every change as the LLM resumption document.

#### Scenario: New endpoint without docs
- **WHEN** a route handler gains an exported method absent from the spec
- **THEN** the unit suite fails until the spec (and regenerated collection) include it
