# Delta: recipe-authoring (pack-units)

## ADDED Requirements

### Requirement: Pack as a recipe unit

Recipe mentions SHALL accept `pack` / `packs` as a unit
(`@Oatmeal(id){1%pack}`). At line-building time the quantity expands
through the product's pack size (packQuantity × packUnit) BEFORE
canonicalization — `resolveQuantityForComparison` stays the single
conversion choke point — while `displayQuantity`/`displayUnit` keep the
pack phrasing verbatim. A pack mention on a product without a pack size
SHALL fail body validation with a message naming the product and the
missing "Pack size" field. The live nutrition preview SHALL price pack
mentions identically (and show nothing while the pack size is missing).

#### Scenario: One pack of oatmeal

- **GIVEN** oatmeal with pack size 61 g
- **WHEN** a recipe line reads `{1%pack}`
- **THEN** the stored line is 61 g canonical, the detail page renders
  "1 pack", and nutrition uses 61 g

#### Scenario: No pack size declared

- **WHEN** `{2%packs}` mentions a product with no pack size
- **THEN** saving fails with a body error telling the author to set the
  product's Pack size
