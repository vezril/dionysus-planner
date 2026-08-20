## ADDED Requirements

### Requirement: Products carry merchant links
The full product form SHALL accept one merchant URL per line (http/https
only), stored replace-set and round-tripped on edit; the pantry item
detail page SHALL render them as external links.

#### Scenario: Two stores
- **WHEN** the user saves a product with two merchant URLs
- **THEN** both round-trip on edit and render as links on the pantry item detail page

### Requirement: Quick-consume is drink-aware
The ready-to-consume checkbox SHALL read "Ready to consume" on both
product forms, and the pantry row's quick-consume button and dialog
SHALL say "Drink" for DRINK-category products and "Eat" otherwise. The
grams alcohol field SHALL hint that Drink + Volume switches to % ABV.

#### Scenario: A canned beer
- **WHEN** a ready-to-consume DRINK product is stocked
- **THEN** its pantry row offers a "Drink" button and the confirm dialog says Drink
