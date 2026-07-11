# Dionysus Planner

Single-user, self-hosted pantry/recipe planner. Next.js 15 (App Router) +
Drizzle/better-sqlite3 + Tailwind/shadcn-ui. See `docs/architecture.md` for
the full architecture decision record and `docs/stories/` for the
implementation plan.

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `pnpm build` / `pnpm start` — production build / serve.
- `pnpm lint` — ESLint, including the `/domain` and `/data` module
  boundary rules (architecture.md §5).
- `pnpm test:unit` — Vitest, `/domain/**` pure functions only.
- `pnpm test:integration` — Vitest, `/data/**` + `/app/actions/**` against
  real SQLite (`:memory:`/temp files).
- `pnpm test:e2e` — Playwright against a locally built `pnpm start`
  instance (chromium/firefox/webkit + a 375px mobile viewport).

## Requirements

- Node.js 22.x (see `.nvmrc`) and pnpm (see `packageManager` in
  `package.json`).
