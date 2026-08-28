# Proposal: observability-logging

## Why

The planner has no logging. When something misbehaves on the NAS the
only evidence is a stack trace if it happened to throw — there is no
record of which request came in, which decision a flow took, or whether
the inventory service was slow or unreachable. `kubectl logs` shows
essentially nothing during normal operation.

## What changes

- `lib/logger.ts` — a dependency-free structured logger emitting one
  JSON object per line (k8s/`kubectl logs` friendly, greppable):
  `{ts, level, event, ...fields}`. Level from `DIONYSUS_LOG_LEVEL`
  (error|warn|info|debug, default info); silent under `NODE_ENV=test`
  unless set explicitly, so suites stay readable.
- **HTTP**: every `app/api/**` handler wraps its body in
  `withRouteLog(event, request, fn)` — method, path, status, duration,
  and the thrown error when one escapes. Handlers keep their
  `export async function GET` shape so the OpenAPI drift gate still
  detects them.
- **Outbound**: `services/dionysusService.ts#request` is the single
  choke point for every inventory-service call — logs target, status,
  duration, and unreachable/non-2xx failures at warn/error.
- **Decision points** in the flows where an all-or-nothing sequence can
  half-happen: cook (service-first, soft-fail meal log), pantry eat,
  planner consume (FIFO allocation across batches), plan-entry writes.
  Validation refusals log at debug, service failures at warn/error.
- **Boot**: migrations applied and seed outcome, replacing the two bare
  `console.error` calls.

## Impact

- No schema, API surface, or UI change; log lines are additive.
- Never logs request bodies wholesale, only ids, counts, and outcomes —
  the app has no auth and runs on a private network, but dumping bodies
  into logs is still the wrong default.
