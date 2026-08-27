# custom-pantry-items

## Requirements

### Requirement: Ingredients can carry product identity
An ingredient SHALL optionally carry `brand`, `barcode`, and package size (`packageQuantity` + `packageUnit`). A non-empty `barcode` SHALL be unique across ingredients; ingredients without a barcode are unlimited.

#### Scenario: Creating a product with a barcode
- **WHEN** a custom item is created with barcode "064100128866"
- **THEN** the ingredient stores it, and a second item with the same barcode is rejected with a field error naming the conflict

#### Scenario: Products without barcodes coexist
- **WHEN** two custom items are created with no barcode
- **THEN** both save successfully

### Requirement: A custom pantry item is created in one step from the pantry page
`/pantry` SHALL offer a "Create custom item" control opening a form with: name, unit class, full nutrition (same fields and reference-quantity basis as the ingredient form), optional product identity (brand, barcode, package size), and an initial on-hand quantity (zero allowed) with unit. Submitting SHALL create the CUSTOM ingredient and its pantry row atomically — never one without the other.

#### Scenario: Creating "Ritz crackers" from the pantry
- **WHEN** the user creates a custom item named "Ritz crackers" with nutrition, a barcode, and initial quantity 200 g
- **THEN** one new ingredient (source CUSTOM) and one pantry row exist, and the pantry list shows the item immediately

#### Scenario: Creating a custom item with zero initial quantity
- **WHEN** the user creates a custom item with initial quantity 0
- **THEN** the item appears in the pantry list in its out-of-stock state

#### Scenario: Validation failure creates nothing
- **WHEN** the form is submitted with a missing required field (e.g. no name)
- **THEN** a field error is shown and neither an ingredient nor a pantry row is created

### Requirement: Zero-quantity pantry rows persist
A pantry row SHALL accept quantity zero on creation and on edit, SHALL remain listed at zero, and SHALL render a visible out-of-stock indication instead of a quantity. Only the explicit Remove control deletes a row. (MODIFIES the S-304-era `quantity > 0` rule, which predates the openspec specs.)

#### Scenario: Editing an item down to zero
- **WHEN** the user edits an existing pantry item's quantity to 0
- **THEN** the row stays in the list showing out-of-stock, and its detail page still opens

#### Scenario: Restocking a zero row
- **WHEN** the user edits a zero-quantity row to 350 g
- **THEN** the row shows "350 g" again with no out-of-stock indication

#### Scenario: Zero stock never satisfies a recipe
- **WHEN** a recipe requires an ingredient whose pantry row is at zero
- **THEN** cookability treats it exactly as insufficient stock (unchanged matcher behavior)

### Requirement: Nutrition can be entered against any same-class basis
Nutrition-entry forms (the pantry "Create custom item" dialog, and the ingredient create/edit form) SHALL accept an optional nutrition basis — "per ⟨quantity⟩ ⟨unit⟩", defaulting to the reference basis (100 g / 100 mL / 1 count) — and the system SHALL convert the entered values to per-reference before persisting. Stored values remain per-reference; downstream consumers are unaffected.

#### Scenario: Soda can entered per 355 mL
- **WHEN** a VOLUME custom item is created with calories 150 entered against a basis of "per 355 mL"
- **THEN** the stored per-reference calories are 150 × (100 / 355) ≈ 42.2537, and the detail page's per-100 mL facts reflect that — no manual math

#### Scenario: Default basis behaves exactly as before
- **WHEN** the basis is left at its default
- **THEN** entered values persist unchanged (per-reference), identical to pre-change behavior

#### Scenario: Basis unit from the wrong class is rejected
- **WHEN** a MASS ingredient's nutrition is entered with a basis of "per 355 mL"
- **THEN** a field error on the basis unit is shown and nothing is saved — never a silent guess

#### Scenario: Count-class basis
- **WHEN** a COUNT item's nutrition is entered "per 2 each"
- **THEN** stored per-1 values are the entered values halved

### Requirement: Editing prefills per-reference values with the reference basis
The ingredient edit form SHALL prefill stored (per-reference) values with the reference basis selected. The system SHALL NOT reconstruct or imply the basis originally used at entry time.

#### Scenario: Editing a basis-entered item
- **WHEN** the soda from the first scenario is edited
- **THEN** the form shows ≈42.2537 against a "per 100 mL" basis

### Requirement: Count entries resolve against packaged items via package size
When comparing quantities between COUNT and a MASS or VOLUME class, and the
ingredient has a package size whose unit class equals the non-COUNT side,
the system SHALL resolve using `1 each = ⟨packageQuantity packageUnit⟩`, in
both directions, everywhere unit resolution occurs (cookability matching,
what-can-I-cook, recipe nutrition). Without a usable package size the
comparison SHALL remain unresolved — never a guess.

#### Scenario: A can in a recipe
- **WHEN** a recipe line says "2 each" of a VOLUME ingredient packaged as 355 mL
- **THEN** the line resolves to 710 mL — nutrition and matching both use it

#### Scenario: Grams of a counted package
- **WHEN** a recipe line says "100 g" of a COUNT ingredient packaged as 200 g
- **THEN** the line resolves to 0.5 each

#### Scenario: Pantry stock counted in cans
- **WHEN** the pantry holds "1 each" of that 355 mL VOLUME ingredient and a recipe needs 300 mL
- **THEN** cookability treats the stock as 355 mL and the recipe is cookable

#### Scenario: No package size, still unresolved
- **WHEN** a COUNT line references a VOLUME ingredient with no package size (or a package unit that is not a known unit key)
- **THEN** the line is unresolved, exactly as before

### Requirement: Package unit is a known unit key
Entry forms SHALL offer the package unit as a selection of known unit keys
(any class), and validation SHALL reject a package unit that is not a known
unit key. Existing stored values that case-insensitively match a known key
SHALL be normalized to it by migration; values that match nothing behave as
no package size.

#### Scenario: Legacy lowercase value
- **WHEN** the database holds packageUnit "ml" from before this change
- **THEN** after migration it reads "mL" and activates package-size resolution

### Requirement: Alcohol is an optional tracked nutrient
Ingredients SHALL carry an optional alcohol value (grams per reference
quantity) with the same semantics as the existing optional nutrients:
null means not recorded (never zero), entry forms offer it alongside
fiber/sugar/sodium, nutrition-basis conversion scales it, detail pages
render it (or "not recorded"), and recipe totals include it only when
every constituent line's ingredient has it.

#### Scenario: Beer entered per can
- **WHEN** a VOLUME item is created with alcohol 14 g against a per-355 mL basis
- **THEN** the stored per-100 mL alcohol is ≈3.9437 g and the detail page shows it

#### Scenario: Absent stays absent
- **WHEN** an ingredient is saved without an alcohol value
- **THEN** its detail page shows "not recorded" for alcohol and recipe totals including it are incomplete for alcohol

### Requirement: Ingredients carry sparse micronutrient values
Ingredients SHALL support zero or more micronutrient values from a
versioned domain registry (vitamins A, C, D, E, K, B1, B2, B3, B6, B9,
B12; calcium, iron, magnesium, potassium, zinc — each with a fixed label
unit), stored per reference quantity in a sparse table keyed by
(ingredient, nutrient). Entry forms SHALL offer repeatable
nutrient-select + amount rows (duplicates rejected), nutrition-basis
conversion SHALL scale the amounts, and the pantry detail page SHALL
render only the nutrients present. Extending the registry SHALL NOT
require a schema migration.

#### Scenario: Vitamin D supplement as a COUNT item
- **WHEN** a COUNT custom item "Vitamin D3" is created with micronutrient vitamin D 25 µg per 1
- **THEN** its detail page shows "Vitamin D 25 µg" and no other micronutrient rows

#### Scenario: Basis conversion scales micronutrients
- **WHEN** a VOLUME item is created per-355 mL with vitamin C 60 mg
- **THEN** the stored per-100 mL vitamin C is ≈16.9014 mg

#### Scenario: Duplicate nutrient rejected
- **WHEN** the form submits two rows for the same nutrient
- **THEN** validation fails with a field error and nothing is saved

#### Scenario: No micronutrients, no section
- **WHEN** an ingredient has no micronutrient rows
- **THEN** its detail page renders no Micronutrients section

### Requirement: Saturated fat, trans fat, and cholesterol are optional tracked nutrients
Ingredients SHALL carry optional saturated fat (g), trans fat (g), and
cholesterol (mg) per reference quantity with the same semantics as the
existing optional nutrients (null = not recorded, unit-labeled entry on
both forms, basis conversion scales them, detail pages render them,
recipe totals complete only when every constituent has the value). Cook
mirrors SHALL forward them to the meal service via the micronutrient map
so day rollups include them, labeled correctly on the Inventory day view.

#### Scenario: Butter's label
- **WHEN** a MASS product is saved with saturated fat 51.4 g and cholesterol 215 mg per 100 g
- **THEN** its detail page shows both values and a recipe using it totals them

#### Scenario: Absent stays absent
- **WHEN** the three fields are left blank
- **THEN** detail pages show "not recorded" and recipe totals for them are incomplete

### Requirement: Phosphorus is a registry micronutrient
The micronutrient registry SHALL include phosphorus (mg), available in
the entry rows and rendered like any other micronutrient.

#### Scenario: Supplement with phosphorus
- **WHEN** a product records phosphorus 700 mg per reference
- **THEN** the detail page's micronutrients list shows "Phosphorus 700 mg"

### Requirement: Products carry a category
Every product SHALL have a category — FOOD (default), DRINK, or
SUPPLEMENT — selectable on both entry forms, editable, shown as a badge
on catalog rows and the pantry detail page. Existing rows default to
FOOD.

#### Scenario: A can of beer
- **WHEN** a beer is saved with category DRINK
- **THEN** its catalog row and detail page show a Drink badge

#### Scenario: Default unchanged
- **WHEN** a product is saved without touching the category
- **THEN** it is FOOD and renders exactly as before

### Requirement: Pantry rows know when they were stocked
Each pantry row SHALL carry a stocked-at timestamp, set on creation and
reset whenever its quantity increases (restock/increment/replace/upward
edit); quantity decreases SHALL NOT change it. The pantry list SHALL
show how long ago each row was stocked; the detail page shows the date.

#### Scenario: Consuming keeps the clock
- **WHEN** a row stocked 5 days ago is partially consumed by cooking
- **THEN** it still reads as stocked 5 days ago

#### Scenario: Restocking resets the clock
- **WHEN** more stock is added to an existing row
- **THEN** the row reads as stocked today

### Requirement: Shelf life turns age into expiry hints
Products SHALL accept an optional shelf life in days. When set, pantry
rows with stock SHALL show an expiry estimate (stockedAt + shelf life):
an "expiring" indicator within 3 days of the estimate and an "expired"
indicator past it. Rows without a shelf life show age only — never a
guessed expiry.

#### Scenario: Milk about to turn
- **WHEN** milk has shelf life 14 and was stocked 12 days ago
- **THEN** its pantry row shows an expiring indicator (~2 days left)

#### Scenario: Expired
- **WHEN** the estimate is in the past
- **THEN** the row shows an expired indicator

#### Scenario: No shelf life, no guess
- **WHEN** a product has no shelf life
- **THEN** its row shows only how long ago it was stocked

### Requirement: Products may declare their generic ingredient
A product SHALL optionally link to a generic ingredient (an ingredient
with no generic link of its own) of the SAME unit class, editable on
both entry forms and shown on the detail page. Linking to a product, a
different unit class, or a missing ingredient SHALL be rejected.
Deleting a generic still linked by products SHALL be refused with a
message naming the products.

#### Scenario: Two butters
- **WHEN** "Lactantia Butter" and "Kirkland Butter" both link to generic "Butter"
- **THEN** each detail page shows the generic and "Butter" cannot be deleted while they exist

### Requirement: Group stock is interchangeable for availability
Cookability, What Can I Cook, planner depletion, and the shopping list
SHALL treat a recipe line's available stock as the SUM over the line
ingredient's group (the generic and all products linked to it), with
lines normalized to the group so overlapping references aggregate
rather than double-count. Recipe nutrition display continues to use the
line's own ingredient.

#### Scenario: Recipe sees branded stock
- **WHEN** a recipe needs 200 g of generic "Butter" and the pantry holds two branded butters at 150 g each
- **THEN** the recipe is cookable and the shopping list wants nothing

### Requirement: Cooking asks which product is used
When a cook line's group has more than one stocked pantry row, the cook
dialog SHALL require selecting exactly which product is being used
before confirming; the selected row is consumed. One stocked row
behaves as before; zero behaves as missing.

#### Scenario: Which butter?
- **WHEN** a recipe line resolves to a group with two stocked butters and the user confirms the cook
- **THEN** confirmation is blocked until one butter is selected, and only the selected butter's pantry row is decremented

### Requirement: Volume drinks enter alcohol as percent ABV
On both entry forms, a VOLUME-class product with category DRINK SHALL
offer "Alcohol (% ABV)" (0–100) instead of grams; the value is stored as
alcohol grams per 100 mL via ethanol density (ABV × 0.789), is NOT
scaled by the nutrition basis (a ratio), and is converted back for edit
prefill. Non-drink or non-volume products keep gram entry. The detail
page shows the derived ABV alongside the grams for such items.

#### Scenario: A 5% beer
- **WHEN** a VOLUME Drink is saved with 5% ABV against a per-355 mL basis
- **THEN** the stored alcohol is 3.945 g per 100 mL (basis-independent) and the detail page shows "(5% ABV)"

#### Scenario: ABV on a non-volume item is rejected
- **WHEN** ABV is submitted for a MASS product
- **THEN** validation fails on the ABV field

### Requirement: Ready-to-eat products can be eaten straight from the pantry
Products SHALL have a ready-to-eat flag (checkbox on both forms; no
effect on recipe usability). A stocked ready-to-eat pantry row SHALL
offer an Eat action — quantity prefilled to 1 each (COUNT) or the
package size — that, service-first and all-or-nothing: logs a
direct-consumable service meal (mirroring the product as directly
loggable), consumes the pantry quantity, and records an eaten entry on
today's plan. A service failure consumes nothing.

#### Scenario: A can of beer, no recipe
- **WHEN** the user hits Eat on a ready-to-eat 355 mL-packaged beer and confirms
- **THEN** 355 mL leaves the pantry, today's day log gains the beer's nutrition, and today's plan shows the beer marked eaten

### Requirement: Products carry custom categories
Products and generics SHALL accept user-defined free-text categories
(comma-separated input on both product forms), stored as a replace-set
and round-tripped on edit.

#### Scenario: Tagging salmon
- **WHEN** the user saves a product named "Salmon, atlantic" with categories "fish, salmon"
- **THEN** both categories persist and reappear when editing the product

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

### Requirement: Categories nest by path and browse as a tree
A category MAY be a "/"-separated path (broad → narrow). The products
page SHALL offer a "By category" view rendering the nested tree with
products as leaf links (search prunes non-matching branches; products
without categories group under "Uncategorized"), and recipes SHALL
derive a tag for EVERY level name of their ingredients' category paths.

#### Scenario: Rhum styles
- **WHEN** two products carry "Rhum/Lightly Aged Pot Rhum" and one carries "Rhum/Agricole"
- **THEN** the tree shows Rhum with both styles nested and the right products under each, and a recipe using one derives both "Rhum" and its style as tags

### Requirement: Quick pantry quantity adjust
Stocked pantry rows SHALL offer an Adjust control with ¾, ½, ¼, and
Out presets applied to the current displayed amount, alongside the
exact-quantity Edit dialog.

#### Scenario: Roommate used the rice
- **WHEN** the user hits Adjust → ½ on 296 g of rice
- **THEN** the row reads 148 g; Adjust → Out marks it out of stock

### Requirement: Categories carry optional nutrition defaults
A category path MAY store optional per-100 g/mL nutrition (calories,
protein, carbs, fat, % ABV), editable from the products category tree
(set and clear). When a product is created with categories, EMPTY
nutrition fields SHALL prefill from the deepest matching category path
(exact before ancestor, first-listed category on ties,
case-insensitive), with a visible note; user-typed values are never
overwritten.

#### Scenario: New rhum bottle
- **WHEN** "Rhum/Lightly Aged Pot Rhum" has defaults (231 kcal, 40 % ABV) and the user creates a product with that category leaving calories blank
- **THEN** calories and ABV prefill from the category and the form notes the source

### Requirement: A generic can be created from the product form
The Generic-of menu SHALL offer creating a new generic inline: the
product submit carries the generic's name, and the server reuses an
existing same-unit-class generic with that exact name
(case-insensitive) or creates one seeded with the product's resolved
nutrition, then links the product to it.

#### Scenario: First beer in the pantry
- **WHEN** the user adds "Lagabière" picking "New generic…" named "Beer"
- **THEN** a "Beer" generic exists with the product's unit class and nutrition, and Lagabière links to it; a second product naming "beer" reuses it

### Requirement: Inner pack size on products

Products SHALL carry an optional inner pack size (packQuantity +
packUnit, migration 0019) alongside the outer package, editable in the
product form and the custom-item dialog; when both sizes are set the
form SHALL hint "≈ N packs per package". The Eat/Drink dialog SHALL
prefill one pack (falling back to the package, then blank), the pantry
Adjust menu SHALL offer a "−1 pack" preset when a pack size exists in
the row's unit class, and the consumption portion ladder SHALL become
1 each (COUNT) → one pack → one package → the 100 g/100 mL reference.

#### Scenario: Oatmeal box of six packs

- **GIVEN** a 366 g box with package 366 g and pack 61 g
- **WHEN** the Eat dialog opens or the planner consumes one planned
  portion
- **THEN** the prefilled/consumed quantity is 61 g, and Adjust's
  "−1 pack" drops the row from 366 g to 305 g
