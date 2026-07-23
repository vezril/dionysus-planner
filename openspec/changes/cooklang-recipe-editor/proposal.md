# Proposal: cooklang-recipe-editor

## Why

The recipe editor today is a form: a separate "Instructions" textarea plus a repeating row-based UI (ingredient picker + quantity spinbutton + unit select, one row per ingredient, an "Add ingredient line" button). The owner wants to author recipes the way Cooklang and Markdown both work — one continuous typed document where lightweight inline syntax (`@ingredient{quantity%unit}`) carries the structure, instead of clicking through a form. No recipes exist yet, so this is a clean swap with no data migration.

## What Changes

- **BREAKING (recipe authoring UI only):** the per-line ingredient form (ingredient combobox + quantity + unit per row) is removed and replaced by a single textarea where the whole recipe body is typed as prose with inline `@Ingredient Name(id){quantity%unit}` mentions. Recipe name, servings, and tags remain separate fields, unchanged.
- Typing `@` opens an autocomplete dropdown (backed by the existing `/api/ingredients?q=` endpoint, same one the old picker used); selecting a result inserts the ingredient's name plus its catalog ID as a mention token, so the link to a real catalog row is captured at selection time — never guessed later from text (preserves FR-24's ID-only matching).
- A new pure `domain/cooklangParser.ts` module extracts `{ingredientId, quantity, unit}` lines from the typed body server-side; the Server Action feeds its output into the exact same `toLineInputs` → `createWithLines`/`updateWithLines` path that exists today. **No changes to the DB schema, the matching engine, or the nutrition engine.**
- The recipe detail (read-only) view renders the body with the `(id)` annotation stripped, so readers see clean prose, not raw IDs.
- Cookware (`#tool{}`) and timers (`~{duration}`) — standard Cooklang syntax — are explicitly out of scope: not parsed, not tracked, left as an idea for later.

## Capabilities

### New Capabilities
- `recipe-authoring`: the typed, Cooklang-inspired recipe editor — the mention grammar, the autocomplete-and-link UX, and the parse-into-lines contract that keeps the existing matching/nutrition engines untouched.

### Modified Capabilities
<!-- none tracked in openspec/specs/ — the original recipe-editor behavior (PRD FR-13/14, docs/stories/S-401/S-402) predates OpenSpec adoption and was never captured as a spec file, so there is no delta to reconcile against. -->

## Impact

- Rewritten: `app/recipes/_components/recipe-editor.tsx`, `domain/validation/recipe.schema.ts` (drops `lines`, adds `body`), `app/actions/recipe-actions.ts` (parses `body` instead of trusting client-submitted `lines`).
- New: `domain/cooklangParser.ts` (pure, framework-free — parse + a display-stripping helper).
- Changed: `app/recipes/[id]/page.tsx` (renders the stripped body).
- Full rewrite required for `tests/e2e/recipe-create.spec.ts` and `tests/e2e/recipe-edit.spec.ts` (the old DOM contract — per-line rows, Quantity spinbutton, Unit combobox — no longer exists). `tests/e2e/recipe-detail.spec.ts`, `tests/e2e/recipe-tags.spec.ts`, `tests/e2e/recipe-list*.spec.ts`, and all vitest coverage of `domain/nutrition.ts`/`domain/matching.ts`/repositories are unaffected (they operate on `recipe_line` rows, which still exist in the same shape).
- No DB migration: `recipe.instructions` column is reused verbatim to store the annotated body text.
