

### Requirement: Ingredients carry an optional Ariadne product reference

An ingredient SHALL carry a nullable `productId` identifying the same
thing in the Ariadne Product Catalog. The column is a plain nullable
text field with no foreign key, because the referent lives in another
system. It SHALL default to null on create, survive updates that do not
mention it, and appear in the backup export.

Null SHALL remain permanently legitimate: an ingredient may have no
market product at all ("salt to taste", water, home-grown produce).
Nothing in planning, cooking, or logging may require it.

At this step nothing reads the reference — no UI, no API, no
resolution. It exists so the later migration steps have somewhere to
write.

#### Scenario: A product created today

- **WHEN** any ingredient is created through the existing forms or the
  mobile surface
- **THEN** it is stored with `productId` null and behaves exactly as
  before

#### Scenario: The reference survives an edit

- **GIVEN** an ingredient whose `productId` has been set
- **WHEN** its nutrition is edited through the normal update path
- **THEN** the reference is unchanged
