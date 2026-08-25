# UX — the constellation standard

Dionysus-planner is the **reference implementation** of the homelab's
UX/brand standard. The standard itself lives in the codex repo:
`codex/docs/ux-standards.md` — one shared cyberpunk base (dark-only,
near-black violet ground, hue-280 surfaces, neon focus ring), one god
accent per service. Dionysus is the flagship dual-accent service
(family cyan `--primary` + magenta `--accent`).

Enforcement here:
- `tests/unit/uxStandards.test.ts` pins every shared-base token and the
  focus ring against the standard — a retheme that drifts fails CI.
  Change the standard first, then the pin.
- All component color comes from the tokens (no hardcoded hex/oklch in
  tsx — grep-clean as of v2.39).
- The iOS app mirrors the palette in
  `dionysus-ios/Sources/Dionysus/Core/Theme.swift` (sRGB conversions of
  the same oklch values); update it alongside any sanctioned change.

Brand marks and generation prompts: `docs/brand-prompts.md`.
