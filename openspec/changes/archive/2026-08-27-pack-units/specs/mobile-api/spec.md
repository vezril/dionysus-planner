# Delta: mobile-api (pack-units)

## ADDED Requirements

### Requirement: Pack size over the mobile surface

`POST /api/mobile/products` SHALL accept optional `packQuantity` and
`packUnit` (pack size requires its unit, mirroring the package pair
rule), documented in lib/openapi.ts with the Insomnia collection
regenerated. Product payloads returned by the mobile surface SHALL carry
the two fields.

#### Scenario: Scanner flow with packs

- **WHEN** the app creates a 366 g oatmeal box with packQuantity 61,
  packUnit "g"
- **THEN** the product saves both sizes and recipe/pantry pack
  affordances work for it
