# S-102: Domain units & conversion engine

**Epic:** E-1 Foundation | **Status:** TODO | **Depends on:** S-101
**Covers:** FR-9, FR-10, FR-11, FR-12 / NFR-7 (conversion error ≤1%)

## Context

The scaffold (S-101) exists but `/domain` is empty. This story builds the framework-free unit system that every later computation depends on: the fixed unit table, canonical conversion, and the single cross-class resolution function used identically by nutrition and matching. Read: prd.md FR-9–FR-12 and Glossary (Unit Class, Canonical Unit, Density); architecture.md §4 "Unit / UnitClass" code constant, §4 "Canonical-unit & density strategy" (the `resolveQuantityForComparison` contract is specified there verbatim), §5 `/domain` layout.

## Acceptance Criteria

1. Given the `UNITS` constant, when its members are enumerated per class, then Mass = {g, kg, oz, lb}, Volume = {mL, L, tsp, tbsp, cup, floz}, Count = {each}, with US-customary factors (cup=240 mL, tbsp=15 mL, tsp=5 mL, floz=29.57 mL; oz=28.3495 g, lb=453.592 g) (FR-10).
2. Given any two units of the same class, when converting a quantity between them via canonical, then the result matches the stated definitions within 1% (FR-10, NFR-7) — e.g., entering 2 lb yields ≈907.184 g canonical (FR-9).
3. Given `toCanonical(displayQuantity, displayUnit)`, when called with a valid unit, then it returns `{ quantityCanonical, entryUnitClass }` and never mutates or loses the display values (FR-9's exact-redisplay contract is satisfied by callers persisting display values verbatim).
4. Given `resolveQuantityForComparison(entryQtyCanonical, entryClass, targetClass, densityGPerMl)`, when `entryClass === targetClass`, then the canonical quantity is returned unchanged (FR-10/FR-11 baseline).
5. Given the same function, when classes differ as Mass↔Volume and density is present, then it converts (g = mL × density, mL = g ÷ density) with accuracy sufficient for FR-12's 5% end-to-end tolerance (FR-12).
6. Given the same function, when classes differ with no density, or either class is COUNT mismatched with anything, then it returns the sentinel `'UNRESOLVED'` — never zero, never a guess (FR-11).
7. Given `/domain/units.ts` and `/domain/types.ts`, when linted, then they import nothing from Next.js, React, Drizzle, or better-sqlite3 (architecture §5 boundary rule).

## Tasks

- [ ] TEST: (unit, Vitest, `tests/unit/domain/units.test.ts`) assert the `UNITS` table contains exactly the FR-10 unit set with the PRD's stated factors.
- [ ] IMPL: `domain/types.ts` (`UnitClass`, domain shapes for Ingredient/PantryItem/RecipeLine per architecture §4) and the `UNITS` constant in `domain/units.ts` exactly as architecture §4 specifies, plus `REFERENCE_QUANTITY_BY_CLASS` (100 g / 100 mL / 1 each).
- [ ] TEST: (unit) `toCanonical` cases — 2 lb → ≈907.184 g + MASS; 1 cup → 240 mL + VOLUME; 3 each → 3 + COUNT; unknown unit rejected (typed error or never-type exhaustiveness).
- [ ] IMPL: `toCanonical()`.
- [ ] TEST: (unit) same-class round-trip conversions between every unit pair in a class stay within 1% of definitionally computed values (FR-10 AC).
- [ ] IMPL: any helper needed (e.g., `fromCanonical(qty, unit)` for display conversion) to make the round-trip tests pass.
- [ ] TEST: (unit) `resolveQuantityForComparison` — same-class identity; mass→volume and volume→mass with density (hand-computed expectations, e.g. 240 mL flour @ 0.53 g/mL = 127.2 g); no-density mass↔volume returns `'UNRESOLVED'`; COUNT vs MASS/VOLUME returns `'UNRESOLVED'` even when density is set.
- [ ] IMPL: `resolveQuantityForComparison()` per the architecture §4 signature.

## Dev Notes

- Touches ONLY `/domain/types.ts`, `/domain/units.ts`, `/tests/unit/domain/units.test.ts`. Zero imports from `/data`, `/app`, or any framework (verified by S-101's ESLint rules). This is the primary TDD surface named in ADR-007.
- FR-11 edge semantics are load-bearing for the whole app: `'UNRESOLVED'` is a sentinel the callers (S-103 nutrition, S-104 matching) must treat as "unsatisfied / incomplete," never 0 — do not throw for this case and do not return NaN.
- Density applies ONLY to the Mass↔Volume pair (FR-12, NG-14). COUNT never converts cross-class.
- Unit keys/factors are a versioned code constant, not a DB table (architecture §4) — do not create a units table.
- OUT of scope: nutrition math (S-103), matching (S-104), persistence of canonical+display values (S-201/S-202), Zod schemas (S-302/S-304/S-401).
