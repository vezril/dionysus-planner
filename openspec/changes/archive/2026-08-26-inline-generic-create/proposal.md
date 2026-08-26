# Create a generic from the product form's menu

## Why
Linking a new product to a generic that doesn't exist yet forces a
detour: leave the form, create the generic, come back. The Generic-of
menu should offer creating one inline.

## What Changes
- Both product forms' Generic-of select gains "＋ New generic…" which
  reveals a name input; the product submit carries newGenericName.
- The create actions (full form + quick-create) resolve it server-side:
  reuse an existing same-class generic with that exact name
  (case-insensitive), else create one seeded with the product's own
  resolved nutrition (same unit class and FOOD/DRINK category, no
  brand/barcode/package), then link the product to it.

## Impact
both schemas + actions, data facade lookup, both forms, integration +
e2e, train v2.41.0.
