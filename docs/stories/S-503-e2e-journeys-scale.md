# S-503: End-to-end journeys, first-run & scale verification

**Epic:** E-5 What Can I Cook | **Status:** TODO | **Depends on:** S-303, S-305, S-402, S-403, S-406, S-502
**Covers:** FR-29 (full first-run sweep), UJ-1–UJ-5 / NFR-2, NFR-3, NFR-8, NFR-10

## Context

All features exist. This story is the cross-cutting acceptance layer: full user-journey e2e suites (UJ-1 through UJ-5) exercised as continuous flows rather than per-story fragments, the complete first-run empty-state sweep, the 375px responsive pass across all primary views, and the NFR-3 scale/performance fixture test. Read: prd.md §4 (UJ-1–UJ-5), FR-29, NFR-2/3/8/10, §9 Success Criteria #2 and #4; architecture.md ADR-007 (e2e = Playwright against built `next start`, three engines), §6 Flow C (scale argument to verify empirically).

## Acceptance Criteria

1. Given a fresh install (seed only), when Pantry, Recipes, Ingredients, and What Can I Cook are each visited, then every view renders its empty state with a CTA — no errors, no blank pages — in all three browser engines (FR-29 AC, NFR-10).
2. Given the five user journeys, when executed end-to-end (UJ-1 pantry management; UJ-2 recipe authoring with inline ingredient creation; UJ-3 what-can-i-cook decision; UJ-4 nutrition viewing with a flagged incomplete value; UJ-5 manual nutrition entry + seeded override), then each completes through the real UI without error.
3. Given a script-populated dataset at NFR-3 scale (2,000 ingredients, 500 recipes, 300 pantry items), when `/what-can-i-cook` is requested, then the full scan completes and the response is served in ≤2 s on the test machine, and the Cookable Now classification on a hand-verified fixture subset has zero false positives (NFR-3, Success Criterion #2 + counter-check).
4. Given the primary views at NFR-3 scale, when loaded, then initial meaningful render is within the 2 s LCP budget on the test machine (NFR-2 — smoke-level, reference-hardware validation deferred per OQ-4).
5. Given the 375px mobile project, when each primary view and form is exercised, then no horizontal scroll appears and controls are tappable (NFR-8 AC).

## Tasks

- [ ] TEST: (e2e, `tests/e2e/first-run.spec.ts`) full FR-29 sweep against a fresh DB across chromium/firefox/webkit projects.
- [ ] IMPL: test-only fresh-DB fixture helper (temp DB_PATH per worker, boot server against it) if not already present from earlier stories.
- [ ] TEST: (e2e, `tests/e2e/journeys.spec.ts`) UJ-1 through UJ-5 as five continuous journey specs composing the flows built in S-301..S-502 (create ingredient inline during recipe authoring for UJ-2/UJ-5; override a seeded ingredient and see it propagate for UJ-5/FR-3).
- [ ] IMPL: shared e2e page-object/helpers to keep journey specs maintainable (test infrastructure only — no production code expected).
- [ ] TEST: (integration/perf, `tests/integration/scale.test.ts`) NFR-3 load fixture — script-generate 2,000 ingredients / 500 recipes (~5 lines each) / 300 pantry items into a temp DB; time the Flow C scan (repo fetch + domain compute) ≤2 s; assert zero false positives on an embedded hand-verified fixture subset (Success Criterion #2 counter-check).
- [ ] IMPL: dataset-generation script under `/tests` (deterministic seed for reproducibility).
- [ ] TEST: (e2e/perf) with the scale DB, load `/what-can-i-cook`, `/recipes`, `/pantry` — server response + LCP proxy within budget (Playwright timing assertions; flag, don't hard-fail, marginal results pending OQ-4 hardware).
- [ ] TEST: (e2e, mobile project) 375px sweep of every primary view and each dialog/form (pantry form, recipe editor, ingredient forms, threshold slider).
- [ ] IMPL: fix any responsive defects the sweep exposes (touches only UI layout code).

## Dev Notes

- Touches `/tests/e2e/**`, `/tests/integration/scale.test.ts`, test helpers; production-code changes limited to responsive/timing defects it exposes.
- ADR-007: everything runs on the host against a built `next start` — NO Docker in this story (Docker smoke is S-601).
- NFR-1/NFR-2/NFR-3 thresholds are formally pinned to reference hardware left open by OQ-4 — treat CI-machine numbers as smoke-level evidence and record actuals in the test output for the readiness gate.
- Keep journey specs additive: per-story e2e specs from earlier stories remain the fast regression layer; journeys are the slower acceptance layer (consider a separate Playwright project/tag).
- OUT of scope: Docker packaging and container-level NFR checks (S-601), Lighthouse tooling investment beyond Playwright timing proxies.
