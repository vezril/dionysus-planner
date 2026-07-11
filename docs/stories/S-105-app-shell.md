# S-105: App shell, navigation & error boundaries

**Epic:** E-1 Foundation | **Status:** DONE (2026-07-11) | **Depends on:** S-101
**Covers:** FR-29 (shell-level groundwork) / NFR-2, NFR-8

## Context

The scaffold (S-101) exists with placeholder pages. This story builds the persistent application shell: root layout, navigation between the four primary areas (What Can I Cook, Pantry, Recipes, Ingredients), the root redirect, and the App Router error/not-found boundaries. Each area gets a placeholder page with a correct empty-state message so navigation never 404s; the real views replace these in E-3/E-4/E-5. Read: architecture.md §5 (`/app` layout — root `page.tsx` redirects to `/what-can-i-cook`), §6 "Error handling strategy" (error.tsx / not-found.tsx conventions); prd.md FR-29, NFR-8.

## Acceptance Criteria

1. Given the app root `/`, when loaded, then it redirects to `/what-can-i-cook` (architecture §5 — JTBD-1 front door).
2. Given any primary view (`/what-can-i-cook`, `/pantry`, `/recipes`, `/ingredients`), when loaded on a fresh app, then a layout with working navigation renders and the view shows a defined empty-state message with a call to action — never an error or blank page (FR-29).
3. Given a 375px-wide viewport, when any shell page renders, then there is no horizontal scroll and nav controls are tappable (NFR-8).
4. Given an unexpected server error in a route group, when it occurs, then the route's `error.tsx` boundary renders a generic recoverable error view; given a nonexistent detail URL, then `not-found.tsx` renders (architecture §6 error strategy).

## Tasks

- [ ] TEST: (e2e, Playwright `tests/e2e/shell.spec.ts`) root `/` redirects to `/what-can-i-cook`.
- [ ] IMPL: root `app/page.tsx` redirect + `app/layout.tsx` with nav (shadcn/Tailwind, mobile-first).
- [ ] TEST: (e2e) each of the four nav destinations renders without error and shows an empty-state message containing a CTA (placeholder content acceptable, FR-29 baseline).
- [ ] IMPL: placeholder `page.tsx` for `/pantry`, `/recipes`, `/ingredients`, `/what-can-i-cook` with empty-state copy + CTA links (real data wiring replaced by S-30x/S-40x/S-501).
- [ ] TEST: (e2e, 375px mobile project) shell pages have no horizontal scroll at 375px (assert `document.documentElement.scrollWidth <= 375`).
- [ ] IMPL: responsive nav (e.g., stacked/sheet nav at mobile widths) per NFR-8.
- [ ] IMPL: `error.tsx` per route group + root `not-found.tsx` — verified by: a test route that throws renders the boundary in dev (remove test route after), plus e2e visit to `/recipes/999999` renders not-found once S-403 exists (leave a TODO assertion here; formal coverage in S-403).

## Dev Notes

- Touches `/app/layout.tsx`, `/app/page.tsx`, placeholder pages, `error.tsx`/`not-found.tsx`, `/components`. No `/data` or `/domain` changes; no DB access yet (placeholders are static RSC).
- ADR-002: shell pages are Server Components; only interactive nav bits (mobile menu toggle) may be client components.
- Placeholder empty states will be superseded by the real per-view empty states (S-304 pantry, S-404 recipes, S-501 WCIC) — keep copy consistent with FR-29's examples ("Add your first pantry item").
- OUT of scope: any data fetching, forms, or business logic; the real What Can I Cook view (S-501).
