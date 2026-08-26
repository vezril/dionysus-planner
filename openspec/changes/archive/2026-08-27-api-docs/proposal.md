# API docs, Insomnia collection, LLM pickup file

## Why
The API has no web-accessible documentation, no ready-made client
collection, and no maintained entry document for another LLM to resume
from.

## What Changes
- lib/openapi.ts: OpenAPI 3.1 spec — single source of truth. Served
  raw at GET /api/openapi and rendered house-style at /api-docs (no
  external viewer/CDN); Guide links it.
- scripts/generate-insomnia.mjs generates
  public/insomnia-collection.json (downloadable from /api-docs).
- Drift gate (tests/unit/openapiCoverage.test.ts): every route
  handler's exported methods must be documented, no phantom paths, and
  the collection must cover every operation.
- CLAUDE.md: the LLM pickup file (architecture, invariants, process,
  current state, feature log) — updated as part of every train.

## Impact
lib/, two routes+page, script+public asset, tests, CLAUDE.md, guide
link, train v2.43.0.
