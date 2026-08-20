# Proposal: shopping-list

## Why

The planner shows WHAT to cook; the missing half is what to BUY. The
depletion math already knows every shortfall — it just isn't collected
anywhere.

## What Changes

A **Shopping list** section on `/planner` for the displayed week:
simulate the week's planned entries against the pantry IN ORDER (the
same consumption planner the cook flow uses) and aggregate, per
ingredient, everything the pantry can't cover — partial shortfalls in
the pantry row's own unit, entirely-missing ingredients in their
canonical unit, and a count of unquantifiable (unresolved) lines listed
by name. One "Copy list" button puts a plain-text version on the
clipboard for the store. Empty plan or fully-covered week → "nothing to
buy".

## Impact

`domain/shoppingList.ts` (pure, composes planCookConsumption), facade
extension (PlannerWeek += shoppingList), one component, tests. No
schema, no service.
