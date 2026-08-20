## 1. Implementation

- [x] 1.1 `category` column (NOT NULL DEFAULT 'FOOD', migration 0007); schemas; repo/action/facade threading; form selects; catalog + detail badges
- [x] 1.2 `domain/abv.ts` (`computeRecipeAbv`) + recipe detail display

## 2. Verification

- [x] 2.1 Unit tests (ABV math incl. density/package volume, no-alcohol null); integration (category persists, default FOOD); e2e (drink product badge; cocktail ABV)
- [x] 2.2 Full gate; walkthrough; train v2.14.0
