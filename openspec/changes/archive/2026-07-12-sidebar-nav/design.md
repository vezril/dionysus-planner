# Design: sidebar-nav

## Context

All four pages wrap content in `max-w-2xl/3xl p-6`. At 375px, that's already only 327px of content width today. A fixed-width sidebar carved out of the same viewport leaves too little (~147px at 180px sidebar width) — measured during exploration.

## Decisions

1. **Responsive sidebar width, not responsive visibility.** "Always visible" = presence, not identical pixel width. Desktop: comfortable width (`w-56`, labels + padding). Mobile (`<sm`): narrower (`w-32`), tighter padding, smaller text — still full labels, just compact. No breakpoint hides it; no drawer, no toggle.
2. **`MainNav` becomes a Client Component** (`usePathname()` for active-route detection). Isolated — the only client boundary this change introduces; every page stays a Server Component.
3. **Active item**: cyan text + `glow-primary` (existing utility from the retheme) + left border accent. Reuses tokens, no new palette work.
4. **Layout**: `app/layout.tsx`'s `flex-col` wrapper → `flex-row`; sidebar is `<aside>`, main content keeps its own scrolling/padding untouched.
5. **Hand-rolled, not shadcn's `sidebar` block.** No collapse/expand/drawer state needed, so the primitive's complexity isn't earned.

## Risks / Trade-offs

- [147px→ wider mobile content well shrinks further under sidebar+padding] → mitigated by Decision 1 (narrower sidebar on mobile); re-verify no horizontal scroll at 375px (NFR-8) as an explicit task.
- [Client Component flip on nav] → scoped to one small component; rest of app unaffected (ADR-002 mostly intact).
