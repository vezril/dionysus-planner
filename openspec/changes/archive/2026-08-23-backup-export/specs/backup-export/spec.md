## ADDED Requirements

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
