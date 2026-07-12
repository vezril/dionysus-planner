# Tasks: cyberpunk-retheme

## 1. Token palette

- [x] 1.1 Replace the `:root` palette in `app/globals.css` with the design's locked oklch values (background/card/popover, primary cyan, accent magenta, destructive, foreground/muted, border/input, ring = primary); set `--radius: 0.15rem`; remove the unused light-theme values and the `.dark` block's divergent palette (dark-only, Decision 1).
- [x] 1.2 Add `--status-cookable` and `--status-near` tokens and map them in `@theme inline` so `text-status-cookable` / `bg-status-near` etc. resolve as utilities.
- [x] 1.3 Add the glow utilities (`glow-primary`, `glow-cookable`, `glow-near`, `glow-destructive`) per Decision 4 (`color-mix` alpha shadows), plus a global `focus-visible` glow-ring convention.
- [x] 1.4 Verify contrast computationally (script or manual oklch→relative-luminance check) for the functional text pairs; adjust L values if any pair is below 4.5:1 — verified by: recorded ratios in the PR description.

## 2. Semantic application

- [x] 2.1 Cookability badges (recipe list `cookability-badge`, WCIC sections): consume the status tokens + matching glow; MISSING_MORE gets the muted/destructive treatment — verified by: visual sweep, existing e2e green.
- [x] 2.2 Shortfall text in WCIC unsatisfied lines uses the near/destructive semantics.
- [x] 2.3 Nutrition values, quantities, and shortfall figures get `font-mono tabular-nums` (recipe detail nutrition tables, pantry row quantities, WCIC shortfalls).

## 3. Verification

- [x] 3.1 Full local gate: `pnpm lint && npx tsc --noEmit && pnpm test:unit && pnpm test:integration && pnpm build && pnpm test:e2e` — all green with zero test-file edits.
- [x] 3.2 Visual sweep in the browser (dev server): every route, every dialog (pantry add/edit/remove, ingredient create/edit/delete, recipe editor, threshold slider), at desktop AND 375px — no light remnants, no unreadable text, Radix popovers/selects look intentional.
- [ ] 3.3 Ship via PR through the CI gate.
