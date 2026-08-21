# Handoff note for Codex — 2026-08-20 session

Everything below shipped on 2026-08-20, planner v2.26.0 → v2.31.0
(each via the standard train: OpenSpec change → gated PR → CI → merge →
tag → Release workflow builds/pushes the image and creates the GitHub
release → helm upgrade → live verification). The companion
dionysus-service stays pinned at v0.1.0 (immutable tags). Archived
OpenSpec changes with full deltas live in `openspec/changes/archive/`.

## What shipped

### v2.26.0 — pantry-quick-eat
- Portion slider ranges to `max(4 × servings, 24)`.
- `ingredient.readyToEat` (migration 0013) with a checkbox on both
  product forms; stocked ready-to-eat pantry rows get an Eat action
  (prefilled 1 each or the package size) that logs a direct-consumable
  service meal, consumes the pantry, and records a `kind: "eat_item"`
  plan entry on today (plan-entry kind enum widened, TS-only).
- Inventory ready-to-consume and the planner's ready-to-eat picker
  merge batches into ONE row per recipe with summed portions; the
  Batches admin page keeps per-batch rows.

### v2.27.0 — dashboard-week-day-cards
- The dashboard's week period renders seven per-day cards (mini day
  views: meals, kcal, macros, alcohol units, day-level fit coloring;
  unlogged days say "Nothing logged"); each card links to
  `/dashboard?period=day&date=<date>`. Other periods keep the table.

### v2.28.0 — ingredient-categories-auto-tags
- `ingredient_tag` (migration 0014): user-defined category labels on
  products/generics, comma-separated input on both product forms.
- Recipes derive tags at read time: the union of each line
  ingredient's categories and its generic root's. List rows show and
  filter manual ∪ derived; the detail page shows derived tags as muted
  dashed chips; the edit form holds only manual tags.

### v2.29.0 — ratings-variants-links
- Migration 0015: `recipe.rating`, `recipe.variantOfId`,
  `ingredient_link`.
- 1–5 star control on recipe detail (clicking the current star
  clears); stars on list rows.
- "Create variation" duplicates a recipe (lines + manual tags) as its
  own recipe linked to the ROOT, then opens the copy's editor; detail
  pages cross-link both ways; list rows note "variation of X".
- Merchant links: one-URL-per-line textarea on the full product form
  (http/https only), rendered as "Where to buy" on the pantry item
  detail page. Intended future input for demeter deal-finding.
- Consume QOL: checkbox relabeled "Ready to consume"; the quick-consume
  button/dialog say **Drink** for DRINK-category products.
- ABV clarification: the reported "alcohol in grams regression" was NOT
  a regression — % ABV entry only renders when Category = DRINK AND
  Unit class = VOLUME, and new products default to FOOD. Both forms now
  hint this under the grams field.

### v2.30.0 — recipe-missing-highlight
- The recipe detail ingredient list badges lines the pantry can't
  cover at authored servings: "missing from pantry" (red) / "not
  enough in pantry" (amber), computed by the cook preview's grouped
  generic/product plan (`previewCook` at factor 1, local-only).

### v2.31.0 — pantry-grid-watermark
- Pantry rows align as fixed grid tracks on sm+ (name 1fr ·
  right-aligned quantity · freshness · right-aligned actions), with an
  empty placeholder cell when the freshness hint is absent; mobile
  keeps the wrapping flex layout.
- Fixed centered logo watermark behind every page (~4% opacity,
  aria-hidden, pointer-events-none, negative z).

### Infra — Tailscale access (chart-only, PR #45)
- `ingress.extraHosts` added to the chart; the release carries
  `mimir.tail783b49.ts.net` and `dionysus.tailscale` as extra host
  rules, so the app serves the tailnet at
  `http://mimir.tail783b49.ts.net:61642` (and
  `http://dionysus.tailscale:61642` on machines with the /etc/hosts
  alias `100.107.133.54 dionysus.tailscale`, mirroring the existing
  `dionysus.lan → 192.168.1.70` entry).

## Design decisions to respect

- **Variations are linked recipes, not inline deltas.** A variation is
  a full recipe with `variantOfId` pointing at the ROOT (variation of a
  variation re-links to the original — families never nest). Cooking,
  nutrition, batches, and tags all work unchanged per variant.
- **Derived tags are computed, never stored.** Recipe auto-tags come
  from `recipeRepo.getAllDerivedTags` at read time and are never
  written to `recipe_tag`; editing an ingredient's categories updates
  every affected recipe instantly, and the recipe edit form must never
  absorb derived tags as manual ones.
- **Eat/Drink flow is service-first and all-or-nothing.** The service
  meal (mirroring the product as `directlyLoggable`, flipping existing
  mirrors via `PUT /api/ingredients/{id}`) must succeed before any
  pantry consumption or plan-entry write; a service failure changes
  nothing locally.
- **Merged batch rows drain FIFO.** The one-row-per-recipe views carry
  the OLDEST batch id with portions left; logging targets it so older
  batches empty first. Per-batch truth stays on the Batches admin page.
- **ABV entry is gated, by design.** % ABV renders only for
  DRINK + VOLUME products (stored as grams via ethanol density);
  everything else enters grams. Don't "fix" the grams field appearing
  on new products — that's the FOOD default, and both forms hint it.
- **Nutrition targets are sparse overrides.** `nutrition_target` rows
  override code defaults in `domain/nutritionTargets.ts` (micros as
  `micro:<key>`); goal vs cap fit semantics are documented in the
  in-repo `nutrition-reference` skill (Health Canada DRIs, CCSA 2023).
- **Single unit choke point.** All unit/package/density conversion goes
  through `resolveQuantityForComparison`; don't add parallel paths.
- **Zero auth, private exposure only.** The app and service have NO
  authentication. LAN + tailnet only; never enable Tailscale Funnel or
  any public ingress.
- **Remote ops over Tailscale use real TLS.** The k3s API cert has SAN
  `DNS:mimir`; use
  `kubectl --server=https://100.107.133.54:6443 --tls-server-name=mimir`
  (helm: `--kube-apiserver=… --kube-tls-server-name=mimir`). Never
  `--insecure-skip-tls-verify`.
- **Train hygiene.** Never pipe gating commands (`gh pr merge | tail`
  once masked a refused merge); verify `state == MERGED` before
  tagging; never reuse a published version tag; the Release workflow
  creates the GitHub release itself — don't `gh release create`
  manually. Helm upgrades pass explicit `--set` values; the release
  values also carry `ingress.extraHosts` — don't `--reset-values`.
- **Playwright serves the last `next build`.** The e2e `webServer` is
  `next start`; always `pnpm build` before a local e2e run or you test
  stale code. Service-gated specs skip without `DIONYSUS_SERVICE_URL`
  and run in CI's `e2e-meal-log` job against
  `calvinference/dionysus:dev`.

Current state: planner v2.31.0 live (helm revision 35), 737
unit+integration tests, ~122 chromium e2e, migrations 0003–0015.
