# Design: eat-now-and-quick-log

## D1 — Eat-now rides the cook action, ordered last

`cookRecipe` input gains `eatNowPortions` (≥ 0, ≤ portions, default 0;
the DIALOG defaults the field to 1 — the action stays neutral). Order:
service batch → pantry transaction → meal log. The meal log is the only
step allowed to fail softly: batch + pantry are already reality, so a
failure appends a warning ("meal not logged — log it from Meals › Log")
to an otherwise-ok result. `eatenAt` is the server's now (the service's
DIONYSUS_TZ handles day bucketing).

## D2 — Quick log is a thin server action

`quickLogBatchPortion(batchId)` in meal-log-actions: one batch-portion
line, portions 1, eaten at now, then revalidate `/meal-log` +
`/meal-log/batches`. The service already rejects over-consumption
(remaining portions guard) — the button renders only when
`remainingPortions >= 1` but relies on the service for correctness under
races. Errors render inline on the row.
