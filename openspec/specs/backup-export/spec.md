# backup-export Specification

## Purpose
Full-data backup endpoints and the Obsidian vault sync.

## Requirements

### Requirement: Full-data backup endpoints
GET /api/backup SHALL return one JSON bundle of recipes (lines, tags,
ratings, variant links), products (nutrition, categories, merchant
links, barcodes), pantry, plan entries, and nutrition targets, with
best-effort meal-log day rollups; GET /api/backup/markdown SHALL return
the same data as Obsidian-ready markdown files (path + content pairs)
rendered by a pure generator with sanitized filenames.

#### Scenario: Vault sync
- **WHEN** the sync script pulls both endpoints
- **THEN** the vault's Dionysus folder holds one note per recipe and product plus a pantry snapshot, and Backup.json restores losslessly

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
