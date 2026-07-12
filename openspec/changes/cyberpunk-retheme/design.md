# Design: cyberpunk-retheme

## Context

Every component uses shadcn semantic tokens (`bg-background`, `text-primary`, `border-border`, …) resolved from ~20 CSS variables in `app/globals.css` (Tailwind v4, `@theme inline`, oklch). A `.dark` custom variant exists but is unused. Fonts already loaded: Geist Sans + Geist Mono (local, NFR-9-safe). The e2e suite (90 tests) asserts structure/roles/testids only — never colors — so a token-level retheme is test-safe by construction.

## Goals / Non-Goals

**Goals:** dark-only Night City aesthetic; neon colors doing semantic work (cookability, warnings, HUD numerics); readability preserved for the phone-in-the-kitchen use case (NFR-8).

**Non-Goals:** light mode or a theme toggle; level-3 novelty (scanlines, glitch animations, clip-path cards, new display fonts); any behavior change; restyling every component by hand (the token system does the propagation).

## Decisions

1. **Dark-only via `:root`, not `.dark`.** The base palette IS the theme; no class switching, no flash-of-light-mode, no dual maintenance. The `.dark` variant remains harmlessly wired but unused. Alternative (default-dark + toggle) rejected: single-user app, owner is "allergic to lightmode".
2. **Palette (oklch, locked):**

   | Token | Value | Role |
   |---|---|---|
   | `--background` | `oklch(0.13 0.02 280)` | near-black, violet-cold |
   | `--card` / `--popover` | `oklch(0.17 0.03 280)` | elevated panels |
   | `--primary` | `oklch(0.85 0.20 195)` | neon cyan — buttons, links, focus ring |
   | `--accent` | `oklch(0.70 0.28 340)` | hot magenta — highlights, active nav |
   | `--status-cookable` | `oklch(0.80 0.25 145)` | acid green |
   | `--status-near` | `oklch(0.80 0.16 85)` | amber |
   | `--destructive` | `oklch(0.65 0.26 25)` | alarm red |
   | `--foreground` | `oklch(0.93 0.01 280)` | body text |
   | `--muted-foreground` | `oklch(0.65 0.03 280)` | secondary text |
   | `--border` / `--input` | `oklch(0.28 0.04 280)` | panel edges |

   Neon values are used for text/borders/glows on dark grounds (high L values keep AA contrast); primary-foreground goes near-black for filled cyan buttons. Body text contrast must clear WCAG AA (≥4.5:1) — verify computationally during implementation, adjust L before shipping, never after.
3. **Status colors as first-class tokens** (`--status-cookable`, `--status-near`), mapped into `@theme inline` so `text-status-cookable` etc. work as utilities. Cookability badges, WCIC section accents, and shortfall text consume these — semantics live in tokens, not per-component hex.
4. **Glow = one reusable convention, not ad-hoc shadows.** A small set of utilities in globals.css (e.g. `glow-primary`, `glow-status-*`): `box-shadow: 0 0 8px + 0 0 24px` at low alpha of the matching token via `color-mix`. Applied to: focus-visible rings (all interactive elements — this doubles as an a11y win), status badges, and card hover. Nowhere else — restraint is what separates level 2 from level 3.
5. **Sharp corners:** `--radius: 0.15rem` (near-sharp; pure 0 makes Radix Select/Dialog look broken rather than styled). One variable, propagates everywhere via the existing radius scale.
6. **HUD numerics:** nutrition values, quantities, and shortfall figures get `font-mono tabular-nums` (Geist Mono already loaded). Headings stay Geist Sans — mono headings tip into level 3 and hurt scanability.

## Risks / Trade-offs

- [Neon-on-dark contrast failures for small text] → the palette pins high-lightness neons; verify AA computationally during implementation; muted-foreground reserved for non-essential text only.
- [Radix components with baked-in light assumptions (e.g. Select popover shadows)] → all vendored shadcn components already consume the tokens; visually sweep every dialog/combobox/slider in the browser as an implementation task.
- [Glow overuse degrading the kitchen-readability constraint] → glow allowlist is fixed in Decision 4; anything else needs a design change.

## Migration Plan

Single PR through the existing CI gate (token edits + badge/numeric classNames). Rollback = revert the PR; no data or behavior surface.

## Open Questions

- None blocking. A future level-3 flourish pass (scanlines on the WCIC header only, etc.) can be its own change if the appetite develops.
