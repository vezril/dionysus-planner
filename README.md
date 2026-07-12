# Dionysus Planner

[![CI](https://github.com/vezril/dionysus-planner/actions/workflows/ci.yml/badge.svg)](https://github.com/vezril/dionysus-planner/actions/workflows/ci.yml)

Single-user, self-hosted pantry/recipe planner. Next.js 15 (App Router) +
Drizzle/better-sqlite3 + Tailwind/shadcn-ui. See `docs/architecture.md` for
the full architecture decision record and `docs/stories/` for the
implementation plan.

## Deploy (Docker)

Images are published to GHCR on every release tag:

```bash
docker pull ghcr.io/vezril/dionysus-planner:latest   # or: calvinference/dionysus-planner:latest (Docker Hub mirror)
docker run -d -p 3000:3000 -v ./dionysus-data:/data ghcr.io/vezril/dionysus-planner:latest
```

Data (SQLite, WAL sidecars included) lives entirely in the mounted `/data`
volume and survives container recreation. The app needs no outbound network
at runtime. Alternatively use the checked-in `docker-compose.yml`.

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

- `pnpm docker:smoke` — build the image and run the full container gate
  (size budget, boot health, seed integrity, durability, offline).

## CI / Releases

- Every PR to `main` must pass three required checks (`checks`, `e2e`,
  `docker-smoke`) — see `.github/workflows/ci.yml`.
- To release: `git tag vX.Y.Z && git push origin vX.Y.Z`. The release
  workflow publishes `ghcr.io/vezril/dionysus-planner:X.Y.Z` (immutable)
  and `:latest`, then creates a GitHub Release. Re-releasing an existing
  version is refused.

## Requirements

- Node.js 22.x (see `.nvmrc`) and pnpm (see `packageManager` in
  `package.json`).
