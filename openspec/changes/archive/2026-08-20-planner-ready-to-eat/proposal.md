# Proposal: planner-ready-to-eat

## Why

A realistic week mixes cooking with eating what's already cooked — the
planner only knows recipes, while the Inventory's batches (frozen meals,
leftovers) are invisible to it.

## What Changes

1. **Two entry kinds** (migration 0010): `cook` (recipe, as today) and
   `eat_batch` (a service batch at a portion count, with the batch label
   snapshotted at plan time so rendering never depends on the service).
2. **Ready to eat in the planner**: the suggestions panel leads with the
   service's batches that still have portions AFTER subtracting this
   week's planned batch entries; the add form offers batches alongside
   recipes.
3. **Depletion untouched by batch entries**: eating a batch consumes no
   pantry — the shopping list and cookability suggestions filter to
   `cook` entries only.
4. **Graceful degradation**: the service being unreachable leaves cook
   planning fully functional (empty ready-to-eat group, quiet note);
   adding a batch entry requires the service (it validates the batch).

## Impact

Migration (recipeId nullable + kind/batchId/batchLabel), repo/facade/
action updates, domain ready-to-eat math, form + panel + day-column
rendering. Batch-entry e2e joins the service-gated job.
