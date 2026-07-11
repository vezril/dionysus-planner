# S-301: Ingredient catalog view & search

**Epic:** E-3 Ingredients & Pantry | **Status:** TODO | **Depends on:** S-105, S-202, S-203
**Covers:** FR-1 (display half), FR-5

## Context

The app shell (S-105), repositories (S-202), and seeded data via boot (S-203) exist. This story replaces the `/ingredients` placeholder with the real catalog: an RSC full-list page plus a client search-as-you-type box backed by `/api/ingredients?q=`. The search endpoint also becomes the reusable ingredient-picker backend for pantry (S-304) and recipe (S-401) comboboxes. Read: architecture.md §5 (`/app/ingredients/page.tsx`, `/app/api/ingredients/route.ts`), ADR-002 (RSC list + client search island), ADR-004 (Route Handler pattern, nodejs runtime); prd.md FR-1, FR-5.

## Acceptance Criteria

1. Given a fresh install (seed applied), when `/ingredients` loads, then ≥300 ingredients render server-side with name, unit class, and key nutrition values, with no manual entry required (FR-1 AC).
2. Given the search box, when the user types "onion", then the visible list filters to case-insensitive substring matches within 300 ms (FR-5 AC).
3. Given `/api/ingredients?q=onion`, when requested, then it returns matching ingredients as JSON, runs on the Node.js runtime, and an empty/missing `q` returns the full list (ADR-004).
4. Given the catalog list, when rendered, then seeded vs custom rows are distinguishable (source badge) and each row links to its edit view (`/ingredients/[id]/edit`, built in S-302) (FR-3/FR-4 UI groundwork).
5. Given a 375px viewport, when the catalog renders, then it is usable with no horizontal scroll (NFR-8).

## Tasks

- [ ] TEST: (integration, `tests/integration/api-ingredients.test.ts`) route handler logic — `q` filtering (case-insensitive substring via `ingredientRepo.searchByName`), empty q returns all, response shape stable for the client.
- [ ] IMPL: `app/api/ingredients/route.ts` — GET, `export const runtime = 'nodejs'`, delegates to ingredientRepo.
- [ ] TEST: (e2e, `tests/e2e/ingredients.spec.ts`) `/ingredients` shows ≥300 rows on fresh install; typing "onion" narrows the list to matches; clearing restores.
- [ ] IMPL: `app/ingredients/page.tsx` (RSC, full list — no pagination per architecture §6) + client `IngredientSearchBox` component (debounced fetch to `/api/ingredients?q=`).
- [ ] TEST: (e2e, mobile project) catalog at 375px — no horizontal scroll, rows readable.
- [ ] IMPL: responsive list/table layout (shadcn Table or stacked cards at mobile width).
- [ ] IMPL: source badge (SEEDED/CUSTOM) + row link to edit route (target page arrives in S-302; link may 404 until then — acceptable within the epic, resolved by S-302) — verified by: badge visible in e2e snapshot assertions.

## Dev Notes

- Touches `/app/ingredients/page.tsx`, `/app/ingredients/_components/*`, `/app/api/ingredients/route.ts`, `/components`, tests. No new domain or data code (S-202's `searchByName` already exists — extend only if the response shape needs a lighter projection).
- ADR-002 split: the list is a Server Component; ONLY the search box is a client island. Initial page load must NOT fetch through the API route (no self-HTTP-call — ADR-004).
- FR-5's 300 ms is met by design (small dataset, debounced local API); do not add caching layers (ADR-011 spirit).
- No pagination at NFR-3 scale (architecture §6 "Lists render in full").
- OUT of scope: create/edit/override forms (S-302), delete (S-303), ingredient picking inside pantry/recipe forms (S-304/S-401 reuse the API only).
