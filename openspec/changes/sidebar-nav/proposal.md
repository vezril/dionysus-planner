# Proposal: sidebar-nav

## Why

Top bar felt wrong for the retheme's HUD aesthetic. Owner wants a left sidebar instead.

## What Changes

- `MainNav` moves from a top bar to a persistent left sidebar.
- Full labels always visible (no icon-only collapse, no drawer/toggle) — narrower on mobile (375px) than desktop, per the width-collision math worked out in exploration.
- Active route gets a glowing highlight (Night City cyan), requiring `MainNav` to become a Client Component (only this one).
- Layout flips from column (`flex-col`) to row (`flex-row`) in `app/layout.tsx`.

## Capabilities

### Modified Capabilities
- `ui-theme`: navigation shell moves from top bar to sidebar; active-state highlight added.

## Impact

- `app/layout.tsx`, `components/nav.tsx` (Server → Client Component).
- No route/testid/behavior changes — `shell.spec.ts`'s nav contract (`role=navigation name=Main`, links by heading text, optional `Menu` button) is generic and unaffected.
