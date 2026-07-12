# Proposal: cyberpunk-retheme

## Why

The v1 UI shipped on shadcn's default neutral light palette — a placeholder, not a design. The owner-user wants a dark-only cyberpunk aesthetic ("Night City" intensity: neon semantics and glow affordances, short of scanline/glitch novelty), and the app's domain gives neon real jobs: cookability states, shortfall warnings, and HUD-like nutrition readouts.

## What Changes

- Redefine the semantic token palette in `app/globals.css` as **dark-only** (the `:root` palette becomes the cyberpunk theme; light mode is removed as a concept, no toggle).
- Palette: near-black violet-cold backgrounds, elevated dark cards, **neon cyan primary**, **hot magenta accent**, plus semantic neon states — acid green (cookable), amber (near match), alarm red (destructive/missing).
- Sharp corners (`--radius` → 0 or near-0) and subtle neon glow (box-shadow) on interactive/focus states and status badges.
- Numeric/HUD surfaces (nutrition values, quantities, shortfalls) render in the already-loaded Geist Mono.
- Cookability badges and What-Can-I-Cook sections adopt the semantic neon colors.
- Explicitly NOT included (level-3 items): scanline/CRT overlays, glitch animations, clip-path angled cards, new display fonts.

## Capabilities

### New Capabilities
- `ui-theme`: the dark-only cyberpunk visual system — token palette, status-color semantics, glow/typography conventions, and its readability/test-safety constraints.

### Modified Capabilities
<!-- none — ci-pr-gate and release-publish are untouched; no runtime behavior changes -->

## Impact

- `app/globals.css` (token values, radius, glow utilities); small className additions in cookability badge / nutrition / WCIC components. Zero data-layer or action changes.
- Test suite unaffected by design (tests assert roles/testids/visibility, never colors); full suite must still pass.
- NFR-8 (375px kitchen use) and text readability (WCAG AA contrast for body text) are hard constraints on palette values.
- NFR-9: any font must be locally bundled — Geist Mono already is; no CDN fonts.
