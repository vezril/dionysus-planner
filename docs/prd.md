# Dionysus Planner — Product Requirements Document (PRD)

**Status:** APPROVED v2 (2026-07-11) — human gate passed; OQ-2 resolved (density IS in v1 scope), OQ-8 resolved (servings count only, serving-weight deferred)
**Date:** 2026-07-11
**Scope:** Greenfield MVP only. Explicitly designed for extension in later releases.

---

## 1. Vision & Problem Statement

Home cooks accumulate a rotating, partial inventory of ingredients — an onion here, half a bag of rice there — and routinely face the question "what can I actually cook with what I have?" without a reliable way to answer it. Recipe sites assume a full, correct pantry and don't account for *quantities on hand*; generic recipe managers don't compute nutrition; nutrition apps don't know what's in the cupboard.

**Dionysus Planner** is a self-hosted, single-user web application that tracks a real pantry (ingredients *and* quantities), lets the user build a personal recipe collection with per-ingredient amounts, and automatically computes each recipe's nutrition from its ingredients. Its core value is turning "what's in my kitchen" into "what can I cook tonight, and what am I close to being able to cook."

This PRD covers the **first release (v1/MVP)** of the core loop: ingredient catalog, pantry with quantities, custom recipes, automatic nutrition computation, and recipe matching/near-match recommendations. It is written to be extended — later releases (meal planning calendars, shopping lists, etc.) are explicitly out of scope here but anticipated.

---

## 2. Target User & Jobs-to-Be-Done

**Persona: "The Home Cook Operator"** — a single technically-comfortable individual who self-hosts the app for personal use (no other household members need separate accounts in v1).

Jobs-to-be-done:
- **JTBD-1:** "When I open my fridge/pantry and don't know what to make, help me see what I can cook *right now* without a grocery run."
- **JTBD-2:** "When I'm almost able to make something, tell me exactly what's missing so I can decide whether to shop for it."
- **JTBD-3:** "When I create my own recipe, don't make me manually calculate calories/macros — do it from the ingredients I already told you about."
- **JTBD-4:** "When I use up or restock an ingredient, let me update that quickly without re-entering everything."
- **JTBD-5:** "Let me run this on my own hardware, with my own data, without accounts or logins getting in the way."

---

## 3. Glossary

| Term | Definition |
|---|---|
| **Ingredient** | A catalog entry for a distinct food substance (e.g., "yellow onion"). Has a name, a **primary unit class** (which fixes its nutrition reference basis), an optional density (g/mL), and a nutrition profile. Recipe lines and pantry items referencing an ingredient may be entered in any supported unit; a unit outside the primary class is only comparable/computable via density (FR-12), otherwise the line is unresolved (FR-11). Referenced by ID, never matched by name/text. |
| **Unit Class** | One of three families a unit belongs to: **Mass**, **Volume**, or **Count**. Conversions only occur within the same class in the v1 baseline (see FR-11); cross-class conversion exists only per-ingredient via density (FR-12). |
| **Canonical Unit** | The single internal storage unit per class used for all math: **grams (g)** for Mass, **milliliters (mL)** for Volume, **each** for Count. Display units are converted to/from canonical for storage and calculation. |
| **Nutrition Profile** | Calories + macros (protein, carbohydrate, fat) plus optional fields (fiber, sugar, sodium), expressed per a reference quantity (per 100 g, per 100 mL, or per 1 each, depending on the ingredient's **primary** unit class). |
| **Pantry Item** | A record of an ingredient the user currently has, with a quantity and unit. Quantities are tracked, not just presence/absence. |
| **Recipe** | A user-authored dish definition: name, servings count, instructions, and one or more recipe ingredient lines. v1 has no seeded/pre-loaded recipes. |
| **Recipe Ingredient (line)** | A single row within a recipe: a reference to an Ingredient plus a required quantity and unit. |
| **Density** | An optional per-ingredient property (g/mL) enabling cross-class (mass↔volume) comparison for that specific ingredient only (should-have, FR-12). |
| **Cookable Now** | A recipe where every ingredient line's requirement is met or exceeded by the corresponding pantry item's quantity (same unit class, canonical comparison). |
| **Near-Match** | A recipe that is not Cookable Now but has a small number of unsatisfied ingredient lines (missing entirely or insufficient quantity), ranked by closeness. |
| **Unsatisfied line** | A recipe ingredient line where the pantry has no matching ingredient ID, has an insufficient quantity, or is unresolved due to a unit-class mismatch with no conversion path. |
| **Shortfall** | For an unsatisfied line with a partial quantity present, the additional amount needed = required − available (in the recipe's unit); its **shortfall proportion** = shortfall ÷ required. For a fully missing or unresolved line, shortfall = the full required quantity and shortfall proportion = 1.0. |

---

## 4. User Journeys

**UJ-1 — Managing the pantry.** User opens the Pantry view, sees a list of current pantry items with quantity/unit. Adds a new item (selecting or creating an ingredient, entering quantity/unit), edits an existing item's quantity after using some, and removes an item that's been fully used.

**UJ-2 — Creating a custom recipe.** User opens "New Recipe," enters name/servings/instructions, adds ingredient lines by searching the catalog and specifying quantity+unit per line (creating a new ingredient inline if not found), saves, and immediately sees the recipe's computed total and per-serving nutrition.

**UJ-3 — Finding what to cook tonight.** User opens the "What Can I Cook" view. Sees a "Cookable Now" list of recipes fully satisfied by the pantry. Below it, a ranked "Near Match" list shows recipes missing a small number of ingredients, with each missing/insufficient line and the exact shortfall quantity called out, so the user can decide whether to substitute, skip, or shop.

**UJ-4 — Viewing recipe nutrition.** User opens a recipe's detail page and sees total nutrition (calories, protein, carbs, fat, and any optional fields present) and the same figures divided per serving, with any incomplete/unresolved values clearly flagged rather than silently shown as zero.

**UJ-5 — Adding an ingredient with manual nutrition, or overriding a seeded one.** User searches the catalog while building a recipe/pantry entry, doesn't find what they need (or finds a seeded value they know is wrong for their brand/product), creates or edits the ingredient's nutrition profile directly, and it's used in all subsequent computations without disturbing the underlying seed record's identity/reference integrity.

---

## 5. Functional Requirements

Each requirement has a stable ID, a priority tier (**MUST** = MVP-blocking, **SHOULD** = v1-desirable but cuttable without breaking the core loop), and a testable acceptance criterion.

### 5.1 Ingredient Catalog & Nutrition

| ID | Tier | Requirement | Acceptance Criterion |
|---|---|---|---|
| **FR-1** | MUST | The system ships with a seeded ingredient catalog of at least 300 common cooking ingredients (a curated subset of USDA FoodData Central), pre-loaded on first run, each with name, unit class, and a nutrition profile (calories, protein, carbs, fat at minimum). | A fresh install with an empty database shows ≥300 ingredients in the catalog with no manual entry required. |
| **FR-2** | MUST | Users can create a custom ingredient with name, unit class (Mass/Volume/Count), and a nutrition profile (calories, protein, carbs, fat required; fiber, sugar, sodium optional). | Valid submission creates a retrievable ingredient; missing required fields blocks save with inline validation errors. |
| **FR-3** | MUST | Users can edit any ingredient's nutrition profile, including seeded ones (override), without destroying the underlying catalog identity referenced by existing recipes/pantry items. | Editing a seeded ingredient's calorie value updates every recipe referencing it the next time nutrition is computed/displayed. |
| **FR-4** | MUST | Users can delete a **custom** ingredient only if it is not referenced by any pantry item or recipe ingredient line; otherwise deletion is blocked with a message listing the referencing records. **Seeded ingredients are never deletable — override-only (FR-3).** The system tracks per-ingredient override state so FR-28 can preserve user edits. | Deleting a referenced ingredient is blocked and lists the referencing recipes/pantry items; deleting an unreferenced custom one succeeds; the delete affordance is absent/disabled for seeded ingredients. |
| **FR-5** | SHOULD | Users can search/filter the ingredient catalog by name substring. | Typing "onion" filters to matching entries (case-insensitive) within 300 ms. |

### 5.2 Pantry & Units

| ID | Tier | Requirement | Acceptance Criterion |
|---|---|---|---|
| **FR-6** | MUST | Users can add a pantry item by selecting (or creating) an ingredient and specifying a quantity and any supported unit (a unit outside the ingredient's primary class is permitted; comparability then follows FR-11/FR-12). **The pantry holds at most one item per ingredient ID**: adding an ingredient already in the pantry updates (increments or replaces, user's choice at entry) the existing item rather than creating a second row. | Saved item appears in the pantry list with the entered quantity/unit shown; adding the same ingredient twice results in one pantry row, never two. |
| **FR-7** | MUST | Users can update a pantry item's quantity/unit. | Edit form pre-fills current values; save updates the list immediately. |
| **FR-8** | MUST | Users can remove a pantry item entirely. | Item disappears from the list and is excluded from all subsequent matching calculations. |
| **FR-9** | MUST | Pantry item quantities are stored/computed in the canonical unit for their class (g / mL / each), while preserving the user's originally entered display unit for the UI. | Entering "2 lb" stores ≈907 g canonically and redisplays as "2 lb" (or the user's chosen display unit). |
| **FR-10** | MUST | The system supports a fixed set of canonical-class units, at minimum: Mass {g, kg, oz, lb}; Volume {mL, L, tsp, tbsp, cup, fl oz}; Count {each}. Volume units use the **US customary standard** (1 cup = 240 mL, 1 tbsp = 15 mL, 1 tsp = 5 mL, 1 fl oz = 29.57 mL). Conversions within a class are accurate to within 1% of these definitions. | Unit dropdown for a mass-class ingredient offers exactly the mass set; converting between any two mass units matches the stated definitions within 1%. |
| **FR-11** | MUST | The system does **not** perform automatic cross-class (mass↔volume) conversion in the v1 baseline. If a recipe line's or pantry item's unit class differs from the ingredient's primary class (or from each other) and no per-ingredient density is available, the affected line is flagged "unresolved — cannot compare units" and treated conservatively as **unsatisfied** for matching (and nutrition-incomplete per FR-19). | A recipe requiring "1 cup" of an ingredient whose pantry entry is in grams (no density set) shows as unresolved/unsatisfied, never silently guessed. |
| **FR-12** | SHOULD *(proposed stretch)* | An ingredient may optionally define a density (g/mL), enabling cross-class conversion for that ingredient only — used both for pantry↔recipe **matching** comparison and for converting a line's quantity to the ingredient's **nutrition reference basis** in FR-17. | With density set, a recipe line in volume units correctly compares against a pantry entry in mass units and contributes correct nutrition, within 5% accuracy; without it, FR-11 applies. |

### 5.3 Recipes

| ID | Tier | Requirement | Acceptance Criterion |
|---|---|---|---|
| **FR-13** | MUST | Users can create a custom recipe with name, servings (integer ≥1), free-text instructions, and one or more recipe ingredient lines (ingredient + quantity + unit). | A recipe with ≥1 ingredient line saves successfully; one with 0 lines is blocked with a validation message. |
| **FR-14** | MUST | Users can edit an existing recipe's metadata and ingredient lines (add/remove/change quantity). | Edits persist and are reflected in nutrition computation and matching on next view. |
| **FR-15** | MUST | Users can delete a recipe. | Deleted recipe no longer appears in the recipe list or in matching results; ingredient catalog and pantry are unaffected. |
| **FR-16** | SHOULD | Users can tag recipes with free-text labels (e.g., "quick," "vegetarian"). | Recipe list can be filtered by one or more selected tags. |

### 5.4 Nutrition Computation

| ID | Tier | Requirement | Acceptance Criterion |
|---|---|---|---|
| **FR-17** | MUST | For any recipe, the system automatically computes total nutrition (calories, protein, carbs, fat, plus any optional micronutrient field present on every constituent ingredient) by summing each line's quantity (converted to the ingredient's nutrition reference basis) times its nutrition profile. A line entered in a unit class other than the ingredient's primary class is converted via density when available (FR-12); otherwise that line's contribution is unresolved and the affected totals are flagged per FR-19. | A recipe with 2 ingredients of known values produces totals matching a manual hand calculation within 0.5% (pre-rounding, per NFR-7). |
| **FR-18** | MUST | The system computes and displays per-serving nutrition = total ÷ servings count. | Changing servings from 4 to 2 doubles all per-serving values without altering totals. |
| **FR-19** | MUST | If any recipe line is unresolved (FR-11) or a referenced ingredient lacks a needed nutrition field, the affected total is visibly flagged as incomplete/partial rather than silently shown as a (wrong) number. | A recipe with one ingredient lacking fat data shows fat as "incomplete/N/A," never as 0. |

### 5.5 Matching & Recommendations ("What Can I Cook")

| ID | Tier | Requirement | Acceptance Criterion |
|---|---|---|---|
| **FR-20** | MUST | The system provides a "Cookable Now" list: a recipe qualifies iff, for every ingredient ID it references, the pantry item for that ID has canonical quantity ≥ the recipe's **total** required canonical quantity for that ID (required quantities are summed across duplicate lines referencing the same ingredient before comparison; unresolved lines per FR-11 count as not satisfied). | Manually verifying each ingredient for a given pantry/recipe pair confirms list membership; a recipe with the same ingredient on two lines requires the sum of both; a recipe drops off the list immediately once simulated pantry depletion takes any requirement below threshold. |
| **FR-21** | MUST | Recipes not Cookable Now are ranked in a "Near Match" list, ascending by count of unsatisfied lines; ties broken by ascending **mean shortfall proportion** across those lines (fully missing or unresolved lines count as proportion 1.0 per the glossary), then alphabetically by recipe name. The default view shows recipes with unsatisfied-line count ≤ 3. *(Threshold of 3 is a proposed default, open for confirmation — see §11.)* | A recipe missing exactly 1 line ranks above one missing 2; of two recipes each missing 1 line, the one 20% short ranks above the one fully missing the ingredient; with the default threshold, a recipe missing 4 lines is excluded while one missing 3 is included. |
| **FR-22** | MUST | For each near-match recipe, the system shows which specific lines are unsatisfied and, where a partial quantity exists, the shortfall (required − available) in the recipe's unit. | A recipe requiring 300 g rice with 100 g in pantry shows "need 200 g more rice." |
| **FR-23** | SHOULD | Users can adjust the near-match threshold (max unsatisfied lines shown) via a UI control. | Raising the threshold from 3 to 5 immediately includes recipes missing 4–5 lines. |
| **FR-24** | MUST | Matching is based solely on ingredient ID equality — no fuzzy/text-based name matching. | A pantry item "onion" and a recipe line for "yellow onion" (distinct catalog entries) do not match unless both reference the same ingredient ID. |

### 5.6 Search & Filter

| ID | Tier | Requirement | Acceptance Criterion |
|---|---|---|---|
| **FR-25** | MUST | Users can search recipes by name substring from the recipe list. | Typing text filters the visible recipe list within 300 ms at the dataset scale in NFR-3. |
| **FR-26** | SHOULD | Users can filter the recipe list by cookability status (All / Cookable Now / Near Match / Missing More). | Selecting "Cookable Now" shows only that subset, consistent with FR-20 at filter time. |
| **FR-27** | SHOULD | Users can sort the recipe list by name, servings, or calories per serving (ascending/descending). | Selecting a sort option reorders the list accordingly. |

### 5.7 Seed Data Integrity

| ID | Tier | Requirement | Acceptance Criterion |
|---|---|---|---|
| **FR-28** | MUST | Re-applying the ingredient seed process (container restart/upgrade) does not create duplicate ingredient entries nor overwrite user edits/overrides to previously seeded ingredients (requires the per-ingredient override tracking noted in FR-4). | Restarting the container twice yields the same ingredient count as after the first run; a previously overridden seeded ingredient's values remain unchanged after restart. |

### 5.8 Empty & First-Run States

| ID | Tier | Requirement | Acceptance Criterion |
|---|---|---|---|
| **FR-29** | MUST | Every primary view handles its empty state gracefully: an empty pantry, an empty recipe list, and a first-run "What Can I Cook" (no recipes and/or no pantry items) each show a defined empty-state message with a clear call to action (e.g., "Add your first pantry item"), never an error or a blank page. | On a fresh install (seeded ingredients only, zero recipes, zero pantry items), Pantry, Recipes, and "What Can I Cook" all render an empty state with a CTA; no view errors or renders blank. |

---

## 6. Non-Functional Requirements

Quantified against a reference environment: a modest self-hosted machine (e.g., low-power NAS, Raspberry Pi 4–class device, or small VPS) — see Open Question OQ-4.

| ID | Requirement | Metric / Threshold | Verification |
|---|---|---|---|
| **NFR-1** | Container startup | Reaches ready/healthy state within **10 seconds** on reference hardware. | Timestamp diff between container start and first successful health-check response. |
| **NFR-2** | Page responsiveness | Primary views (Pantry, Recipe list, "What Can I Cook") reach initial meaningful render within **2 seconds** (LCP) at the dataset scale in NFR-3. | Lighthouse / server-timing measurement on reference hardware. |
| **NFR-3** | Dataset scale | System supports at least **2,000 ingredients** (seed + custom), **500 recipes**, and **300 pantry items** with the full "What Can I Cook" scan completing in **≤2 seconds**. | Load-test script populating datasets at this scale and timing the matching query. |
| **NFR-4** | Docker image size | Production image ≤ **500 MB** uncompressed. | `docker image inspect` size check in CI. |
| **NFR-5** | Data durability | The SQLite database file lives on a documented mounted volume path; stopping, removing, and recreating the container (without removing the volume) preserves all data. | Stop/remove/recreate test comparing data before and after. |
| **NFR-6** | Concurrency model | Single-user, single-writer access is sufficient; SQLite (WAL mode recommended) must not corrupt data under normal single-process request handling. | Sequential and lightly-concurrent request test with no write errors/corruption. |
| **NFR-7** | Computation accuracy | Nutrition is computed at full precision and rounded **only at display time** to the nearest 0.1 g (macros) / whole kcal (calories); accuracy tolerances (FR-17's 0.5%) apply to the pre-rounding computation. Same-class unit conversions carry ≤1% relative error. | Automated tests comparing pre-rounding computed values vs. hand-calculated references. |
| **NFR-8** | Responsive layout | Primary views are usable (no horizontal scroll, tappable controls) at both a ~375px mobile viewport and desktop widths, since the app may be used on a phone in the kitchen. | Manual/automated viewport testing at defined breakpoints. |
| **NFR-9** | Offline-capable deployment | The application functions fully with no outbound internet access at runtime (seed data is bundled in the image/build, not fetched live). | Run container with network disabled; all v1 functionality still works. |
| **NFR-10** | Browser support | Evergreen browsers only: current and previous major version of Chrome, Firefox, and Safari. | Manual smoke test matrix. |

---

## 7. Non-Goals / Out of Scope for v1

These are explicitly deferred — flagged as **future candidates**, not rejected:

- **NG-1** Meal calendar / advance meal planning (assigning recipes to future dates).
- **NG-2** Shopping list generation (derived from near-match shortfalls or planned meals).
- **NG-3** Barcode scanning or receipt/OCR-based pantry import.
- **NG-4** Multi-user support, accounts, authentication, or per-user permissions.
- **NG-5** Native mobile app (iOS/Android) — web-responsive only (NFR-8).
- **NG-6** Live external nutrition API integration (e.g., calling USDA/Edamam at runtime) — v1 uses a bundled, seeded snapshot only.
- **NG-7** Recipe import via URL scraping or photo/image recognition.
- **NG-8** Ingredient expiration dates, freshness tracking, or food-waste alerts.
- **NG-9** Recipe ratings, reviews, or social/sharing features.
- **NG-10** Cost/price estimation or grocery-store price integration.
- **NG-11** Fuzzy/AI/NLP-based ingredient name matching — matching is strictly by ingredient ID (FR-24).
- **NG-12** Data export/import or backup tooling beyond the raw SQLite file on the mounted volume.
- **NG-13** Internationalization/localization (multi-language UI, non-English seed data).
- **NG-14** General cross-class (mass↔volume) conversion without per-ingredient density — only the bounded, opt-in mechanism in FR-12.

---

## 8. MVP Scope Summary

**MUST-have (the core loop — v1 cannot ship without these):** FR-1, FR-2, FR-3, FR-4, FR-6 through FR-11, FR-13 through FR-15, FR-17 through FR-22, FR-24, FR-25, FR-28, FR-29.

**SHOULD-have (desirable, cuttable under schedule pressure without breaking the core loop):** FR-5, FR-12, FR-16, FR-23, FR-26, FR-27.

The core loop, end to end: seed/create ingredients → track pantry quantities → author recipes with per-ingredient quantities → get automatic nutrition → see what's Cookable Now and what's a Near Match. Everything tagged SHOULD refines that loop (search, tags, adjustable thresholds, sorting, density-based conversion) but the loop functions without them.

---

## 9. Success Criteria (design targets, verified by one-time acceptance checks)

*Note: the app is offline, single-user, and telemetry-free (NFR-9, NG-4, NG-12), so these are verifiable design targets checked at acceptance time (and re-checkable manually), not analytics-derived metrics.*

| # | Success Criterion | Counter-Check (guards against gaming/regression) |
|---|---|---|
| 1 | Seed sufficiency: authoring a reference set of 10 common home-cooking recipes (e.g., a stir-fry, a pasta dish, a soup) requires manual nutrition entry for ≤30% of their distinct ingredients — the rest resolve from the seed catalog. | Spot-check 20 seeded ingredients against USDA source values; ≥95% match within rounding — sufficiency must not come at the cost of accuracy. |
| 2 | "What Can I Cook" (Cookable Now + Near Match) renders in <2 seconds at the NFR-3 reference scale (scripted load test). | Zero false positives in Cookable Now classification on a hand-verified fixture set (a recipe listed as cookable must, line-by-line, actually be satisfiable) — speed must not come at the cost of correctness (FR-20). |
| 3 | Durability: the stop → remove → recreate container test (NFR-5) and a container upgrade test both preserve all data, verified by before/after export comparison. | Pantry/recipe write latency stays <100 ms p95 in the same test run — durability must not be achieved by degrading interactive performance. |
| 4 | Usefulness of Near Match: with a fixture pantry of ≥10 items and ≥15 recipes of realistic size, the default Near-Match view (threshold ≤3) surfaces at least one recipe with correct per-line shortfalls (hand-verified). | Fixture recipes average ≥3 ingredient lines — the check must not be satisfiable with trivial 1-ingredient "recipes." |

---

## 10. Assumptions

- **A-1:** "Nutrients/macros" in scope for v1 means calories, protein, carbs, fat as required fields, with fiber/sugar/sodium as optional extras — a full vitamin/mineral panel is out of scope.
- **A-2:** Recipe instructions are free text (markdown-plain), not structured step objects, in v1.
- **A-3:** No authentication/session model is needed since the app is single-user and self-hosted (NG-4); the deployment network boundary (home LAN, VPN, etc.) is the user's responsibility, not the app's.
- **A-4:** Hard-block-on-delete (FR-4) is acceptable UX for v1; soft-delete/archival is not required.
- **A-5:** The initial ~300+ ingredient seed list is manually curated for common home-cooking use (not an automated bulk USDA import), so its contents are a product decision made once, up front, during build.
- **A-6:** Tech-stack constraints locked by the user: the application is a **Next.js** web app persisting to **SQLite**, shipped as a **Docker** container. These are constraints on the solution space, recorded here for traceability; the architecture document owns how they are applied.

## 11. Open Questions (flagged for the human gate)

- **OQ-1:** Confirm the proposed **Near-Match default threshold of 3** unsatisfied lines (FR-21) — is that the right default, or should it be tuned after real usage?
- **OQ-2:** ~~Is FR-12 (density-based cross-class conversion) worth building in v1?~~ **RESOLVED (2026-07-11): yes — FR-12 is confirmed in v1 scope.**
- **OQ-3:** Should a fully-missing ingredient (no pantry item exists) and a partially-insufficient one (some quantity present but not enough) be weighted differently in near-match ranking, rather than both counting equally as "1 unsatisfied line"? Current proposal treats them equally with shortfall-proportion as the tiebreaker only.
- **OQ-4:** What exact reference hardware should NFR-1/NFR-2/NFR-3 targets be validated against (Raspberry Pi 4, a specific NAS model, a commodity VPS tier)? Thresholds are placeholders pending a concrete target.
- **OQ-5:** Confirm the seed ingredient list's curation source/process (A-5) — who selects the ~300+ ingredients and by what criteria (frequency in common recipes? pantry staples list?), since this isn't a mechanical bulk import.
- **OQ-6:** Is a minimal manual "export current SQLite file" affordance wanted in v1 given there's no backup/export FR, or is direct file-system access to the mounted volume sufficient (NG-12)?
- **OQ-7:** Should recipe tags (FR-16) come from a controlled vocabulary or remain fully free-text, given free-text tags can fragment (e.g., "veg" vs "vegetarian")?
- **OQ-8:** ~~Serving-size weight needed?~~ **RESOLVED (2026-07-11): servings count only in v1; serving-weight is a future candidate.**

---

## 12. Definition-of-Ready Check

Each functional and non-functional requirement above was written to satisfy:
- **Necessary** — traces to a stated user intent (meal planning core loop) or a locked constraint (nutrition seeding, quantity tracking, single-user, SQLite, Next.js/Docker); non-goals were used to keep scope from silently expanding.
- **Unambiguous** — each FR/NFR states a single subject and condition; matching semantics (FR-24), unit-conversion bounds (FR-10/FR-11), and near-match ranking (FR-21) are made explicit rather than left implicit, given their prior fuzziness.
- **Singular (atomic)** — CRUD operations are split into distinct FRs (create/edit/delete) rather than bundled, so each can be tested and cut independently.
- **Feasible** — unit conversion is explicitly bounded to same-class only by default (FR-11) with cross-class as an opt-in should-have (FR-12), rather than an open-ended "handle all conversions" requirement.
- **Verifiable** — every FR/NFR carries a concrete acceptance criterion or measurable threshold; qualitative terms ("fast," "scalable") were replaced with numbers in §6.
- **Traceable** — every requirement carries a stable ID (FR-N, NFR-N, UJ-N, NG-N, OQ-N) for downstream reference by the solution architect and implementation stories.

No requirement above was left without an ID, an acceptance criterion, or a stated priority tier. Two items remain intentionally soft pending human decision rather than silently resolved: the near-match default threshold (OQ-1) and the scope status of density-based conversion (OQ-2) — both are marked SHOULD/proposed rather than asserted as locked.
