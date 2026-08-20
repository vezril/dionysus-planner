# Proposal: recipe-display-polish

## Why

The recipe view leaks authoring syntax: instructions render with
`@Name{2%g}` mention markup, and the ingredient list reads name-first
where a cook scans quantity-first ("1 tsp, Paprika").

## What Changes

1. **Instructions read as prose**: mentions render as just the
   ingredient name — "Combine Garlic and Olive oil, then serve." No `@`,
   no braces, no quantities (those live in the list).
2. **Ingredient lines go quantity-first**: "2 g, Garlic powder" — the
   scaled quantity + unit, a comma, the name. Same testids; the portion
   slider keeps rescaling the quantity half.

## Impact

`humanizeMentions` in the cooklang parser + two render tweaks. No
storage, no schema; existing pins are testid-scoped and survive.
