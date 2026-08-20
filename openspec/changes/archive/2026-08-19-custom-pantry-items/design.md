## Context

`dionysus-planner` models everything edible as an `ingredient` (SEEDED from USDA data or CUSTOM), with the pantry as one quantity-holding row per ingredient (`ingredientId` UNIQUE, FR-6). Nutrition is per reference quantity (100 g / 100 mL / 1 count). There is no product identity anywhere: no barcode, brand, or package size. Pantry quantity is validated `> 0` (S-304's `pantryItemSchema`), so "out of stock" is unrepresentable except by deleting the row.

Calvin's long-term plan is a barcode-scanning companion app; the barcode captured here is its future lookup key.

## Goals / Non-Goals

**Goals:**
- One-step branded-product creation from the pantry page (ingredient + pantry row, atomically).
- Product identity on the ingredient model: barcode (unique), brand, package size.
- Zero-quantity pantry rows that persist and render as out-of-stock.

**Non-Goals:**
- No barcode scanning, no lookup-by-barcode endpoint yet (the field is the seam; the API comes with the scanner app).
- No separate `product` table — a branded product is a CUSTOM ingredient with identity fields (avoids a parallel model that recipes/matching/nutrition would all need to learn about).
- No nutrition-per-serving entry mode: nutrition stays per reference quantity like every other ingredient. (Packaged labels are per-serving; converting label→per-100g is the user's arithmetic for now — a label-entry helper is future scanner-app scope.)
- No change to cookability semantics: zero on hand is just insufficient stock.

## Decisions

**1. Product fields live on `ingredient`, all nullable: `brand` TEXT, `barcode` TEXT (partial-unique), `packageQuantity` REAL, `packageUnit` TEXT.**
SQLite UNIQUE indexes treat NULLs as distinct, so a plain unique index on `barcode` allows unlimited barcode-less rows while rejecting a duplicate scan target. Alternatives: a `product` table 1:1 with ingredient (rejected — pure indirection today; nothing else would ever reference it), or fields on `pantry_item` (rejected — identity belongs to the product, not to the stock row; the scanner app must resolve barcode → ingredient even when it's not currently stocked).

**2. `quantity` validation relaxes from `positive()` to `min(0)` in BOTH `pantryItemSchema` and `pantryItemUpdateSchema`; edit-to-zero is the "I ran out" gesture.**
The DB has no CHECK on quantity, repositories don't care, and `domain/matching.ts` treats 0 canonical as insufficient — verified: only the Zod schemas enforce positivity. The pantry list renders a `data-testid="out-of-stock"` badge for zero rows instead of the quantity text. Upsert semantics (NEEDS_CHOICE / increment / replace) are untouched — increment onto 0 works naturally.

**3. One new Server Action `createCustomPantryItem` runs ingredient-create + pantry-insert in one better-sqlite3 transaction** (a new `data/` facade function owning the transaction, same single-transaction discipline as `createRecipeWithLines`). Rejects a duplicate barcode with a field error before insert (and catches the UNIQUE race as a backstop, mapping to the same field error — never a raw constraint message).

**4. The pantry form is a dialog on `/pantry` (matching the existing add-item dialog pattern), backed by a new `customPantryItemSchema`** = ingredient fields (name/unitClass/nutrition + product identity) + `initialQuantity >= 0` + `unit`. The existing `IngredientForm` gains the four optional product fields (shared component → `/ingredients/new` and edit get them free); `ingredientSchema` gains the same optionals so both actions re-validate consistently (ADR-005).

**5. `/pantry/[id]` shows a "Product" panel (brand, barcode, package size) only when at least one field is present** — generic ingredients keep their current page exactly.

## Risks / Trade-offs

- **[Risk] Existing e2e/integration tests pin the `> 0` rejection message.** → Audit and update the pinned contracts in the same PR (this is a deliberate behavior change, recorded in the delta spec as MODIFIED behavior of the S-304-era rule).
- **[Risk] Barcode entered by hand today may not match scanner output format later (UPC-A vs EAN-13 leading zeros).** → Store as free text, trimmed, no format validation beyond non-empty; normalization is the scanner app's concern, and hand-entered data is small enough to migrate then.
- **[Risk] Label nutrition is per-serving; per-100g entry is friction for packaged goods.** → Accepted for now (non-goal); the form labels the basis clearly.

## Migration Plan

One additive migration (4 nullable columns + partial-unique barcode index). No backfill; existing rows have NULL identity. Rollback = drop columns/index; nothing else references them.

## Open Questions

- None blocking. Barcode-lookup API shape is deferred to the scanner-app change.
