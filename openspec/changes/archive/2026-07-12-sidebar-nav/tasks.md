# Tasks: sidebar-nav

## 1. Sidebar component

- [x] 1.1 Convert `components/nav.tsx` to a Client Component: `usePathname()`, active-link detection, glow + cyan highlight on the active item.
- [x] 1.2 Restyle as an `<aside>` sidebar: `w-32` mobile / `w-56` desktop (`sm:` breakpoint), full labels always, vertical stack.

## 2. Layout

- [x] 2.1 `app/layout.tsx`: `flex-col` → `flex-row` wrapper; sidebar + main content side by side.

## 3. Verification

- [x] 3.1 Full local gate green, zero test-file edits: lint, tsc, unit, integration, build, e2e (incl. 375px project — confirm no horizontal scroll).
- [x] 3.2 Visual sweep: desktop + 375px, active-highlight on each of the 4 routes.
- [ ] 3.3 Ship via PR through the CI gate.
