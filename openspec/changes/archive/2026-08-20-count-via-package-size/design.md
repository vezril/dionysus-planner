# Design: count-via-package-size

## D1 — Bridge lives inside `resolveQuantityForComparison`

The function is the single choke point matching and nutrition share, so the
bridge goes there — callers change only by passing the ingredient's raw
pair (`packageQuantity: number | null`, `packageUnit: string | null`); the
function canonicalizes. Alternative rejected: pre-canonicalizing in each
caller — invalid-unit handling belongs in exactly one place.

Resolution order (no overlaps, but stated for clarity):
1. same class → identity (unchanged)
2. MASS↔VOLUME via density (unchanged)
3. COUNT↔(MASS|VOLUME) via package size (new): valid only when
   `packageUnit` is a known unit key whose class equals the non-COUNT side.
   - entry COUNT, target MASS/VOLUME: `count × canonical(package)`
   - entry MASS/VOLUME, target COUNT: `canonicalQty / canonical(package)`
4. otherwise `"UNRESOLVED"` (unchanged)

Non-positive or missing `packageQuantity`, unknown `packageUnit`, or a
package class that matches neither side → rule 3 does not apply (falls to
4). Never a guess.

## D2 — `packageUnit` becomes a unit key

- Schemas: `packageUnit` must be a key of `UNITS` (superRefine or
  `.refine(u => u in UNITS)`), same error surface as other unit fields.
- Both forms replace the free-text package unit input with the existing
  unit `Select` (all classes — a COUNT-class crackers box is packaged in
  g; the package class is deliberately NOT tied to the ingredient's class).
- Existing rows: one drizzle data migration uppercase-normalizes values
  that case-insensitively match a known key (`ml`→`mL`, `ML`→`mL`, `G`→`g`
  …). Anything else is left as-is and simply never activates rule 3.

## D3 — No storage or downstream changes

`quantityCanonical`/`entryUnitClass` on recipe/pantry rows are untouched;
the bridge is evaluated at comparison time, so editing an ingredient's
package size retroactively fixes/changes resolution — same live semantics
as density today.
