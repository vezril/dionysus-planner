# Proposal: nutrition-targets-guide

## Why

The app measures everything and judges nothing: there's no way to see
whether a recipe, a day, or a week actually fits Calvin's needs. The
recommendations must be his — adjustable — seeded from credible
Canadian defaults (Health Canada DRIs, CCSA alcohol guidance).

## What Changes

1. **Adjustable targets** (migration 0012, `nutrition_target(key,
   value)`): macro budgets/goals + weekly alcohol-unit cap +
   per-micronutrient goals, seeded from `domain/nutritionTargets.ts`
   defaults (documented in the nutrition-reference skill), editable on
   the Guide page. Each target is a GOAL (meet-or-exceed) or a CAP
   (stay-under) with ok/near/over|met/partial/low semantics.
2. **Guide tab** (`/guide`, nav after Dashboard): a concise nutrition
   guide (DRIs, AMDRs, the CCSA 0/1–2/3–6/7+ alcohol risk tiers, with
   sources) plus the targets editor.
3. **Fit indicators**:
   - Recipe view: per-serving values show % of the daily target.
   - Dashboard: totals carry status chips — day/week exact (×1/×7),
     longer periods per-logged-day average; alcohol judged against the
     weekly cap.
   - Planner: the week header compares planned calories to 7× the
     daily target.

## Impact

Migration, domain module, targets facade/action, guide page + nav (+
pin), recipe/dashboard/planner display touches. The nutrition-reference
skill (committed in-repo) is the durable knowledge base.
