# Proposal: drift-gate-fail-closed

## Why

The OpenAPI drift gate detects route handlers by regex over source text
(`export (async )?function GET\b`). That means it **fails open**: change
the declaration style and the gate silently stops checking, and CI stays
green while nothing is verified. This is not hypothetical — the
observability-logging train wrapped all 17 handlers four days ago, and
had it used `export const GET = withRouteLog(...)` the gate would have
detected zero routes and passed. The old shape was kept deliberately,
with a comment, which is a convention holding up a safety net.

A gate that fails open is worse than no gate: it also removes the
suspicion that something is unchecked. (Surfaced while describing this
gate to the Ariadne session, which hit the same class of problem and
built the fail-closed version.)

## What changes

- Move the gate from `tests/unit/` to `tests/integration/` — it needs to
  import route modules, which the unit project's charter (pure
  `/domain/**`, no DB, no Next runtime) excludes.
- Detect handlers by **importing each route module** and checking which
  of GET/POST/PUT/PATCH/DELETE are exported functions. Declaration style
  becomes irrelevant: `export const GET = wrap(...)` is detected exactly
  like `export async function GET`.
- Add the fail-CLOSED guard: every `route.ts` must yield at least one
  detected handler. A detection failure now fails the suite instead of
  quietly finding nothing.
- Keep the phantom-path and Insomnia-coverage assertions as they are —
  they catch the failures that actually happen.
- State the scope limit in the file: this proves an operation EXISTS and
  is exported, never that the spec DESCRIBES it correctly.

## Impact

- Test-only. No runtime, schema, or API change.
- `withRouteLog`'s function-declaration shape is no longer load-bearing,
  so the comment explaining why it must stay can go.
