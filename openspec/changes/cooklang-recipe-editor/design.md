# Design: cooklang-recipe-editor

## Context

Today's editor (`app/recipes/_components/recipe-editor.tsx`) maintains a `LineState[]` array in React state, one row per ingredient, each with its own picker/quantity/unit fields; `recipeSchema` requires a structured `lines` array from the client. The Server Action re-validates and calls `toLineInputs()` (quantity/unit → canonical via `domain/units.ts#toCanonical`) before `recipeRepo.createWithLines`/`updateWithLines`. FR-24 is a hard, heavily-tested invariant: ingredient matching is by catalog ID only, never by name. No recipes exist yet — this is a clean-slate UI swap, not a migration.

## Goals / Non-Goals

**Goals:** one typed textarea replaces the row-based form; typed mentions stay linked to real catalog IDs; the matching/nutrition engines and DB schema are untouched.

**Non-Goals:** cookware/timer tracking; a live rendered preview pane; a rich-text/contenteditable editor; portability to external Cooklang tools (the ID-annotation syntax below is an intentional, documented deviation from the Cooklang spec — it optimizes for this app's FR-24 constraint, not for `.cook` file interop).

## Decisions

1. **Mention grammar: `@Name(id){quantity%unit}`.** The catalog ID is embedded directly in the stored text, immediately after the name in parentheses, before the optional `{quantity%unit}` block. This makes the raw body text fully self-describing — no side-channel mapping between "typed position" and "linked ingredient" to keep in sync (the class of bug that a plain positional side-channel would invite). A bare `{quantity}` with no `%unit` means COUNT class (mirrors Cooklang's own convention that a bare number implies "each"). Regex: `/@([^(]+?)\((\d+)\)(?:\{([^}]*)\})?/g` — name captured non-greedily up to the first `(`, so this is robust even though ingredient names may contain commas (e.g. "Onion, yellow, medium"). A stray, un-mentioned `@` a user free-types never matches this pattern (no ID immediately follows) and is left as harmless literal text — no separate escape syntax needed.
2. **Every mention requires a quantity.** Stock Cooklang permits a bare `@ingredient` with no amount at all ("some, unspecified"). This app's nutrition/matching engines require a canonical quantity per line (FR-17/FR-20), so a mention with no `{...}` block is a parse-time validation error, not silently accepted — a deliberate, documented deviation from the Cooklang spec.
3. **The ID is captured at autocomplete-selection time, never re-derived from a name later.** Typing `@` opens a dropdown (reusing `/api/ingredients?q=` — the same endpoint the old picker already used); selecting a result inserts `Name(id)` as one atomic text operation. This is what preserves FR-24: the link is established once, at the moment of an explicit user choice, not by fuzzy-matching text at parse or save time.
4. **Parsing is pure and server-side; the client only detects the `@word` under the caret.** A new `domain/cooklangParser.ts` (framework-free, alongside `units.ts`/`nutrition.ts`/`matching.ts`) exports `parseRecipeBody(body: string): { lines: {ingredientId, quantity, unit}[], errors: string[] }` and `stripMentionIds(body: string): string` (for display). The Server Action calls `parseRecipeBody`, and its `lines` output feeds the **existing, unmodified** `toLineInputs()` → `createWithLines`/`updateWithLines` path. The client component only needs a small "what `@`-word is the caret currently inside" helper to drive the dropdown — it does not need to parse the whole body.
5. **`recipeSchema` drops `lines`, adds `body: z.string()`.** "At least one ingredient" (today's 0-lines check) becomes "at least one successfully parsed mention" — checked after `parseRecipeBody` runs, surfaced as a `body` field error, same UX posture (block save, inline message) as today.
6. **No DB migration.** `recipe.instructions` (existing column) stores the body text verbatim, annotations included. Reopening an existing recipe for edit is trivial: `initialValues.body = record.instructions` — no reconstruction from `recipe_line` rows needed, because the annotated text already round-trips perfectly.
7. **Detail-page display strips the `(id)` annotation** via `stripMentionIds()` before rendering, so readers see `@Onion, yellow, medium{1}` in context, never the numeric ID. The existing separate computed ingredient list + nutrition tables (already driven by `recipe_line` rows) are unchanged.
8. **Autocomplete dropdown is anchored below the textarea, not caret-following.** True caret-coordinate tracking in a plain `<textarea>` needs a text-metrics-measuring "mirror div" technique (or a small dependency) — real complexity for cosmetic polish. v1 ships the simpler anchored-below placement; caret-following is a good follow-up, not blocking.
9. **Field label stays "Instructions"**, not renamed to "Body"/"Recipe" — preserves muscle memory; a short placeholder hint (e.g. "Type `@` to link an ingredient") teaches the new mechanic instead of a label change.

## Risks / Trade-offs

- [The `(id)` annotation is visible while editing — "raw source shows its markup" is a real, if minor, typing-experience wrinkle] → Same trade-off Markdown itself makes (`**bold**` shows literal asterisks while editing); accepted, consistent with the owner's own stated fondness for that model.
- [Regex-based parsing is less robust than a real grammar/parser combinator for edge cases] → Bounded scope (one token shape, one delimiter set) makes a hand-written regex adequate; unit-tested thoroughly (multi-word/comma-containing names, missing `{}`, malformed `(id)`, duplicate mentions of the same ingredient — which must sum, per existing FR-20 behavior, unaffected by this change).
- [Full e2e rewrite for recipe-create/recipe-edit] → Expected and scoped in tasks; all other suites (detail, tags, list, sort/filter, matching/nutrition unit tests) are unaffected since they consume `recipe_line` rows, not the editor UI.

## Open Questions

- None blocking. Caret-following dropdown placement and a live rendered preview pane are both reasonable future polish, deliberately deferred (Decision 8, Non-Goals).
