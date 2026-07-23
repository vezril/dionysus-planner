# Tasks: cooklang-recipe-editor

## 1. Domain parser (pure, TDD)

- [x] 1.1 Write failing unit tests (`tests/unit/domain/cooklangParser.test.ts`) for `parseRecipeBody(body: string)`: mass/volume mentions, bare-count mentions, comma-containing names, missing-`{}` error, malformed/non-numeric `(id)`, duplicate mentions of the same ingredient (both lines emitted), an unlinked bare `@` left as plain text, zero-mention body.
- [x] 1.2 Write failing unit tests for `stripMentionIds(body: string)`: strips `(id)` from every mention, leaves non-mention text untouched.
- [x] 1.3 Implement `domain/cooklangParser.ts` to green (framework-free — no next/react/drizzle imports, ESLint boundary enforced).

## 2. Schema and Server Action

- [x] 2.1 `domain/validation/recipe.schema.ts`: replace `instructions`/`lines` with `body: z.string()`; keep `name`/`servings`/`tags` unchanged.
- [x] 2.2 Write failing integration tests (extend `tests/integration/recipe-actions.test.ts` or a new file) for `createRecipe`/`updateRecipe` consuming `body`: valid mentions create the same `recipe_line` rows as before; zero-mention body blocked; a mention with a nonexistent ingredient ID fails cleanly (no partial write); editing an existing recipe's `getRecipeDetail`-sourced `instructions` round-trips as the new `body` value unchanged.
- [x] 2.3 Update `app/actions/recipe-actions.ts`: call `parseRecipeBody(data.body)` in place of trusting a client-submitted `lines` array, feed its output into the existing `toLineInputs`/`createWithLines`/`updateWithLines` path unchanged; store `data.body` into the `instructions` column verbatim.
- [x] 2.4 Implement to green.

## 3. Editor UI

- [x] 3.1 Rewrite `app/recipes/_components/recipe-editor.tsx`: remove the `LineState[]` row UI and its "Add ingredient line" button; replace the "Instructions" textarea with the single mention-aware textarea (same accessible label "Instructions", placeholder hint teaching `@`). Keep Recipe name / Servings / Tags exactly as-is.
- [x] 3.2 Implement the `@`-word-under-caret detector (plain string/selectionStart logic, no rich-text editor dependency) and the autocomplete dropdown (reuses `/api/ingredients?q=`, anchored below the textarea per design Decision 8); selecting a result inserts `Name(id)` at the cursor.
- [x] 3.3 Wire `initialValues.body` (edit mode) directly from the existing `getRecipeDetail`/`instructions` value — no reconstruction logic needed (design Decision 6).

## 4. Detail page display

- [x] 4.1 `app/recipes/[id]/page.tsx`: render the body through `stripMentionIds()` before display; leave the existing computed ingredient list + nutrition tables untouched.

## 5. E2E rewrite

- [x] 5.1 Rewrite `tests/e2e/recipe-create.spec.ts` for the new textarea + autocomplete contract (name/servings/tags unchanged; new pinned testids/roles for the mention dropdown).
- [x] 5.2 Rewrite `tests/e2e/recipe-edit.spec.ts` similarly, including the round-trip (open existing recipe, body pre-filled verbatim).
- [x] 5.3 Spot-check `tests/e2e/recipe-detail.spec.ts`, `recipe-tags.spec.ts`, `recipe-list*.spec.ts`, `recipe-list-controls.spec.ts`, `wcic-threshold.spec.ts`, `journeys.spec.ts`, `scale.spec.ts` for any fixture setup that used the OLD per-line picker to build recipes via UI — update those helper functions to author bodies via the new textarea; assertions about detail/list/matching behavior itself should need no change.

## 6. Verification & ship

- [x] 6.1 Full local gate: lint, tsc, `pnpm test:unit`, `pnpm test:integration`, `pnpm build`, `pnpm test:e2e` (full matrix) all green.
- [x] 6.2 Visual sweep in-browser: create a recipe with 2+ mentions via `@`-autocomplete, confirm nutrition/cookability reflect it identically to before; edit it back open and confirm the body round-trips; confirm the detail page shows no visible `(id)`.
- [ ] 6.3 PR through the CI gate.
