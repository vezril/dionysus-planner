# Backup export (JSON bundle + Obsidian markdown)

## Why
No backup path exists for the planner's data. The user wants recipes,
products, and the rest exportable — ideally into their Obsidian vault.

## What Changes
- GET /api/backup — one JSON bundle: recipes (lines, manual+derived
  tags, rating, variantOf), products (nutrition, categories, merchant
  links, barcodes), pantry snapshot, plan entries, nutrition targets,
  and best-effort meal-log day rollups (trailing 2 years via the
  service; omitted when unreachable).
- GET /api/backup/markdown — the same data rendered as Obsidian-ready
  files `{files: [{path, content}]}` by a PURE generator
  (domain/backupMarkdown.ts): Recipes/<name>.md (frontmatter + humanized
  ingredients/instructions), Products/<name>.md, Pantry.md, README.md.
- scripts/backup-to-obsidian.sh — pulls both endpoints (LAN first,
  tailnet fallback) and writes ~/Mindmap/Dionysus/ (managed subfolders
  replaced wholesale; Backup.json kept alongside).

## Impact
api routes, domain/backupMarkdown + unit tests, scripts/, train
v2.36.0. Service-native storage backup noted as future work.
