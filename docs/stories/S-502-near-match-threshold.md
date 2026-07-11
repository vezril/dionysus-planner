# S-502: Adjustable near-match threshold

**Epic:** E-5 What Can I Cook | **Status:** TODO | **Depends on:** S-501
**Covers:** FR-23 (SHOULD)

## Context

The What Can I Cook view exists with the default threshold (S-501). This story adds the client threshold control (slider) and the `/api/what-can-i-cook?threshold=` Route Handler it calls, so the user can widen/narrow the Near Match list without a full page reload. Read: prd.md FR-23, OQ-1; architecture.md ADR-004 (Route Handler for this exact parameterized read, nodejs runtime), ADR-002 (the slider is a named client island), §6 Flow C.

## Acceptance Criteria

1. Given the What Can I Cook view, when the user raises the threshold from 3 to 5, then recipes missing 4–5 lines immediately appear in Near Match, correctly ranked, without a full page navigation (FR-23 AC).
2. Given `/api/what-can-i-cook?threshold=5`, when requested, then it returns the same result shape as the initial RSC render computed at that threshold, on the Node.js runtime (ADR-004).
3. Given an invalid threshold (negative, non-numeric, absurd like 10000), when requested, then the API clamps/rejects it safely (validated server-side; never trusted from the client per ADR-005 spirit).
4. Given no user adjustment, when the page loads, then the initial threshold shown by the control equals the env-resolved default (`NEAR_MATCH_DEFAULT_THRESHOLD` → 3) (architecture §4 OQ-1 note).

## Tasks

- [ ] TEST: (integration, `tests/integration/api-wcic.test.ts`) route handler — threshold=5 includes a 4-missing fixture recipe; threshold=1 excludes it; missing/invalid threshold falls back to the env-resolved default; out-of-range values clamped (0 ≤ t ≤ a sane cap, e.g., 20).
- [ ] IMPL: `app/api/what-can-i-cook/route.ts` — GET, `runtime = 'nodejs'`, parse/validate threshold, reuse S-501's data-assembly function (shared loader — do not duplicate the scan logic).
- [ ] TEST: (e2e, `tests/e2e/what-can-i-cook.spec.ts`) slider — fixture with a 4-missing recipe: not visible at default 3; drag slider to 5; recipe appears with its shortfalls; back to 3, it disappears into the summarized count.
- [ ] IMPL: `ThresholdSlider` client component (shadcn Slider) fetching the API and swapping the Near Match section content.

## Dev Notes

- Touches `/app/api/what-can-i-cook/route.ts`, WCIC client components, tests. The scan+compute function must be shared with S-501's RSC (single source of truth for assembly).
- The route must never run on Edge (better-sqlite3, ADR-004) and must validate `threshold` server-side.
- Domain stays env-free: the route resolves the default via the S-501 helper and passes the number in (architecture §4).
- SHOULD-tier: cuttable; S-501 must remain fully functional at the fixed default if this story is dropped.
- OUT of scope: persisting the user's chosen threshold across sessions (not required by FR-23).
