# S-405: Recipe tags & tag filtering

**Epic:** E-4 Recipes & Nutrition | **Status:** DONE (2026-07-11) | **Depends on:** S-401, S-404
**Covers:** FR-16 (SHOULD)

## Context

Recipe authoring (S-401/S-402) and the recipe list (S-404) exist; the `recipe_tag` table exists from S-201. This story adds free-text tag entry in the recipe editor and tag filtering on the recipe list. Read: prd.md FR-16, OQ-7 (free-text is the current decision); architecture.md §4 RecipeTag (composite PK, vocabulary-agnostic join table).

## Acceptance Criteria

1. Given the recipe editor, when the user adds free-text tags (e.g., "quick", "vegetarian") and saves, then the tags persist and display on the recipe's detail and list entries (FR-16).
2. Given the recipe list, when one or more tags are selected in the tag filter, then only recipes carrying ALL selected tags remain visible (FR-16 AC "filtered by one or more selected tags"), composing with the FR-25 name search.
3. Given a tag entered twice on the same recipe, when saved, then it stores once (composite PK) with no error surfaced to the user.
4. Given a recipe edit removing a tag, when saved, then the tag disappears from that recipe and, if no recipe uses it, from the filter options.

## Tasks

- [ ] TEST: (integration, `tests/integration/recipe-actions.test.ts`) tags persist through `createRecipe`/`updateRecipe` — save with tags, read back; duplicate tag in payload deduplicates; removing tags on update deletes join rows; recipe delete cascades tags.
- [ ] IMPL: extend `recipe.schema.ts` (optional `tags: string[]`, trimmed, non-empty strings, deduped) and the recipe actions/repo write path to replace-set tags transactionally.
- [ ] TEST: (e2e, `tests/e2e/recipes.spec.ts`) tag entry — add two tags in the editor, save, tags visible on detail and list.
- [ ] IMPL: tag input in the S-401 editor (chip-style free-text input) + tag display badges.
- [ ] TEST: (unit, Vitest `tests/unit/domain/listFilters.test.ts`) pure tag-AND intersection predicate in `domain/listFilters.ts` (framework-free) — item matches iff it carries ALL selected tags; empty selection matches all; item with extra tags still matches; missing any one selected tag fails.
- [ ] IMPL: `matchesAllTags(item, selectedTags)` predicate in `domain/listFilters.ts`.
- [ ] TEST: (e2e) tag filter — with fixture recipes tagged variously, selecting "quick" filters the list; selecting "quick" + "vegetarian" narrows to recipes having both; combined with a name-search term both constraints apply (wiring check over the unit-tested predicate).
- [ ] IMPL: tag filter control on the recipe list, extending S-404's client-side filter component and delegating to the `listFilters` predicate (Flow D — client-side over the loaded list).

## Dev Notes

- Touches `recipe.schema.ts`, recipe actions, recipeRepo tag writes, `/app/recipes/**` UI, `domain/listFilters.ts` (pure predicate only), tests.
- Tags are FREE TEXT per OQ-7's current state — no controlled vocabulary, no normalization beyond trim (do not lowercase-fold silently; store as typed). A future vocabulary is a data migration, not a schema change (architecture §4).
- SHOULD-tier story: cuttable under schedule pressure without breaking the core loop (PRD §8) — nothing else depends on it (S-406 must not require tags to exist).
- OUT of scope: tag management UI (rename/merge), tag suggestions/autocomplete.
