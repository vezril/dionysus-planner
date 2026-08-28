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

## Brand prompts (2026-08-25)

The neon god-mark generation prompts for the service family live in
[brand-prompts.md](brand-prompts.md) — Dionysus (shipped), plus
Demeter, Hermes, Apollo, Hephaestus, Argus, the Muses, Zeus, and
Artemis, with the per-god accent colors mapped to the ui-theme palette
and the asset-pipeline steps. Use them verbatim when a new service
needs its mark so the set stays visually coherent.

### TASK for Codex: embed the generated marks (2026-08-25)

Calvin is generating the logo images from these prompts now. When the
image files land (expect PNGs named for their god — ask him where he
dropped them if they are not already in the repo):

1. Put the source exports under `docs/brand/<god>.png` in
   dionysus-planner.
2. Embed each mark in `docs/brand-prompts.md` directly above its
   prompt (`![<God>](brand/<god>.png)`) so the doc shows prompt +
   result side by side.
3. Leave the per-service favicon/app-icon pipeline (checkerboard-key
   onto #06060F, re-synthesize glow, cut icon.png/apple-icon.png/
   logo.png) to each service's own repo when that service exists —
   the planner repo only archives the masters.
4. Land it as a small docs PR through the normal gate.

---

# Handoff note for Codex — 2026-08-28 session

Planner v2.43.0 → v2.46.0 shipped today, each via the standard train
(OpenSpec change → full local gate → gated PR → 5 CI jobs → hard
STATE=MERGED check → tag → Release workflow → helm upgrade → live
verify). dionysus-service stays pinned at v0.1.0. Full deltas in
`openspec/changes/archive/2026-08-27-*`.

**Current state: v2.46.0 live (helm revision 50), 838 unit+integration
tests, 188 e2e across chromium/firefox/webkit/mobile-375, migrations
0003–0019.**

## What shipped

### v2.43.0 — api-docs
- `lib/openapi.ts` is the single source of truth for the HTTP surface:
  rendered house-style at `/api-docs` (no Swagger UI, no CDN — theme
  consistent, linked from the Guide), served raw at `/api/openapi`, and
  fed to `scripts/generate-insomnia.mjs` →
  `public/insomnia-collection.json` (downloadable from /api-docs).
- `tests/unit/openapiCoverage.test.ts` is a drift gate: an undocumented
  route handler, a phantom spec path, or a stale Insomnia collection
  fails CI.
- **`CLAUDE.md` is now the LLM pickup file** — architecture map,
  load-bearing invariants, the train process, current state, and a
  per-version feature log. It is updated in the SAME commit as every
  feature train. If you touch this repo, read it first.

### v2.44.0 — planner-consume (migration 0018)
- `plan_entry.consumedAt`: planned batch/pantry entries get a per-entry
  Eat/Drink button that logs the meal **on the entry's own date** (noon
  UTC when backdated; future dates refused), then marks it consumed.
  Consumed entries show an eaten/drunk badge and lose both buttons —
  there is no service-side un-log.
- **Planning reserves, never consumes.** Availability anywhere =
  service remaining − ALL unconsumed planned portions (any week, not
  just the rendered one). Planned counts are now visible in the planner
  picker, the Ready-to-eat list, and the Batches admin page. Removing
  an unconsumed entry frees the reservation with no service call.
- Batch consumption drains the recipe's batches oldest-first even when
  the snapshotted batch was drained since planning; insufficient
  portions fail all-or-nothing.
- `POST /api/mobile/planner-entries/consume` for iOS parity.

### v2.45.0 — nutrition-intake
- Micronutrient registry 17 → **25 keys**: biotin, pantothenate,
  iodine, selenium, copper, manganese, chromium, molybdenum, each with
  a Health Canada adult-male DRI goal seed. Thiamine/Riboflavin/
  Niacin/Folate were already tracked as B1/B2/B3/B9 — labels now lead
  with the common names. A unit test enforces that every registry key
  has a target default.
- Live per-serving nutrition preview in the recipe EDITOR (debounced,
  same parse + math as a saved recipe) with %-of-daily-target chips.
- Planner day cards total their entries' calories and show the share of
  the daily budget, colored by cap fit.

### v2.46.0 — pack-units (migration 0019)
- Products gain an optional INNER pack (`packQuantity`/`packUnit`)
  alongside the outer package: a 366 g box of 6 × 61 g pouches.
- `pack`/`packs` is a recipe mention unit — `@Oatmeal{1%pack}` expands
  through the product's pack size at line-building time (display stays
  "1 pack"), so `resolveQuantityForComparison` remains the single
  conversion choke point. A pack mention on a product with no pack size
  is a named body validation error.
- Eat/Drink prefills one pack; pantry Adjust gains a "−1 pack" preset;
  the consumption portion ladder is now each → pack → package →
  100 g/mL reference.
- **Bug the gate caught, worth knowing repo-wide:** `domain/matching.ts`
  indexed `UNITS[displayUnit]` unguarded and crashed every cookability
  consumer (/recipes, /planner, /what-can-i-cook) on a pack-displayed
  line. Unknown display units now degrade to the class canonical unit.

## Input for the Product Catalog (Ariadne) — stores

Calvin asked today whether stores deserve their own domain or belong
with Ariadne. **Nothing was decided and no code was written in
ariadne-service** — this is discussion input for whoever owns that
card. Note `ariadne-service-82` was a live session at the time.

The answer to the framing question is that stores are already Ariadne's
— four sources agree (`constellation.yaml:142`, `pantheon-roadmap.md:63`,
`product-catalog.md:63`, `ariadne-service/README.md:3-5`) and a `Store`
aggregate is already committed in `ariadne-service/core`. The
interesting part is Calvin's actual requirement, which resolves an open
question:

1. **§10.3 (chain vs individual location) should resolve AGAINST the v1
   default.** Calvin's requirement, verbatim in substance: "IGA is a
   chain that has multiple stores. IGA might have a sale on X, but a
   specific franchise might have a sale on Y which is not at large with
   all IGA stores." He explicitly does NOT care about opening hours,
   addresses, or geo. So the suggestion is to invert the anchor —
   **Store is the individual franchise**, `chain` becomes the grouping
   attribute you roll up by. That is a small edit to a near-trivial
   aggregate, made before anything depends on the current shape.

2. **The flyer feed cannot supply franchise granularity.** Flipp's
   granularity is `(merchant_id, postal_code)` —
   `demeter-service/modules/ingestion/.../FlippDecoders.scala:102-115`
   builds each `Flyer` from a merchant id plus the queried postal code.
   **There is no franchise identifier in the feed.** A flyer price is a
   chain-and-region fact covering a SET of stores; the franchise-specific
   sale Calvin describes is largely invisible to scraping and is learned
   from a receipt or in store.

3. **Therefore `PriceObservation` probably needs an observation scope:**
   exact (`StoreId`, from a receipt or manual entry) vs area
   (`chain + region`, from a flyer). Fanning flyer prices onto every
   store in the chain at write time fabricates precision, which is
   exactly the inference that belongs in Demeter's judgment layer rather
   than Ariadne's fact layer — let the read model fan out at query time,
   ranking exact observations above area ones for the same store.

4. This makes the already-decided alert dedup (option b: dedup per
   `(watchId, ProductId, window)`, alert names the best price across
   stores) actually pay off — with chain-level stores there was rarely
   more than one price to choose between.

5. **Planner-side seam:** dionysus's degenerate store data is
   `purchase.store` (nullable free text, `data/schema.ts`) and
   `ingredient_link.url` (a bare URL list). Both were built in August as
   seams toward Demeter, before Ariadne existed; post-migration they
   become `store_id` references. Receipts are the franchise-exact
   source, which gives `Purchase` a real job beyond bookkeeping.

No action is requested of Codex here beyond routing this to the Ariadne
owner and, if the granularity call is taken, reflecting it in
`docs/product-catalog.md` (the Catalog aggregate table) and the
`ariadne` card in `constellation.yaml`.
