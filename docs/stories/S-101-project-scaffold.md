# S-101: Project scaffold & toolchain

**Epic:** E-1 Foundation | **Status:** TODO | **Depends on:** none
**Covers:** A-6 (locked stack) / NFR-8 (viewport tooling), NFR-10 (browser matrix tooling), NFR-4 (standalone output groundwork)

## Context

Nothing exists yet — this story creates the repository skeleton for the entire project. It sets up the exact stack locked by PRD §10 A-6 and architecture §3 (ADR-001 Next.js 15 App Router, ADR-005 Zod, ADR-006 Tailwind + shadcn/ui, ADR-007 Vitest + Playwright, ADR-008 pnpm, ADR-009 Node 22) plus the directory layout and ESLint-enforced module boundaries from architecture §5. Read: architecture.md §3 (all ADRs), §5 (full module layout + boundary rule), §7 (next.config requirements). No git operations — the orchestrator handles git.

## Acceptance Criteria

1. Given a machine with Node 22 and pnpm, when `pnpm install && pnpm build` is run, then the Next.js 15 (App Router, TypeScript strict) build completes successfully with `output: 'standalone'` and `serverExternalPackages: ['better-sqlite3']` set in `next.config.ts` (ADR-003 mandate).
2. Given the repo, when inspected, then the directory skeleton from architecture §5 exists (`/app`, `/app/actions`, `/app/api`, `/domain`, `/domain/validation`, `/data`, `/data/repositories`, `/data/seed`, `/components`, `/drizzle`, `/tests/unit/domain`, `/tests/integration`, `/tests/e2e`), with placeholder files where needed so the tree is committed.
3. Given the ESLint boundary rules, when a file in `/domain/**` imports `drizzle-orm`, `better-sqlite3`, `next/*`, or `react`, or a file outside `/data/**` imports `drizzle-orm`/`better-sqlite3`, then `pnpm lint` fails (architecture §5 boundary rule).
4. Given the test toolchain, when `pnpm test:unit`, `pnpm test:integration`, and `pnpm test:e2e` are run, then Vitest (two projects: unit, integration) and Playwright (chromium + firefox + webkit projects, plus a 375px-viewport mobile project per NFR-8/NFR-10) each execute at least one trivial passing smoke spec with no Docker dependency (ADR-007).
5. Given `package.json`, when inspected, then it pins `"packageManager": "pnpm@x.y.z"` (required by the §7 corepack Dockerfile), `engines.node: "22.x"`, and a `.nvmrc` with `22` exists (ADR-008/ADR-009).
6. Given Tailwind + shadcn/ui, when a sample page renders, then Tailwind utilities apply and at least one shadcn/ui component (e.g., Button) is vendored into `/components` (ADR-006).

## Tasks

- [ ] Scaffold Next.js 15.x (latest 15.x patch) with App Router, TypeScript strict, Tailwind, `src`-less layout per architecture §5 — verified by: `pnpm build` succeeds.
- [ ] Configure `next.config.ts`: `output: 'standalone'`, `serverExternalPackages: ['better-sqlite3']` — verified by: `pnpm build` succeeds and config file contains both keys.
- [ ] Add `.nvmrc` (22), `engines`, pinned `packageManager` field — verified by: `corepack enable && pnpm -v` matches pin.
- [ ] Initialize shadcn/ui and vendor an initial component set (Button, Dialog, Table, Select, Command, Slider used later) into `/components` — verified by: sample page renders a shadcn Button.
- [ ] Create directory skeleton per architecture §5 with placeholder modules (`domain/types.ts`, `data/db.ts` stub, etc.) — verified by: tree matches §5; `pnpm build` still succeeds.
- [ ] TEST: (tooling smoke, unit level) trivial Vitest unit spec under `/tests/unit/domain` asserting a pure placeholder export — run and see it pass via `pnpm test:unit`.
- [ ] IMPL: Vitest config with separate `unit` and `integration` projects (integration will get DB setup later) and matching `pnpm test:unit` / `pnpm test:integration` scripts.
- [ ] TEST: (tooling smoke, e2e level) trivial Playwright spec loading the root page — run via `pnpm test:e2e`.
- [ ] IMPL: Playwright config with chromium/firefox/webkit projects + a 375px mobile-viewport project (NFR-8, NFR-10), targeting a locally built `next start` instance (ADR-007).
- [ ] Configure ESLint `no-restricted-imports` per-directory boundary rules (only `/data/**` imports drizzle/better-sqlite3; only `/app/**` imports next/react machinery; `/domain/**` imports neither) — verified by: temporarily adding a violating import makes `pnpm lint` fail, then remove the violation.
- [ ] Install runtime deps used by later stories (drizzle-orm, better-sqlite3, drizzle-kit as dev dep, zod, react-hook-form, @hookform/resolvers) — verified by: `pnpm build` succeeds with `pnpm install --frozen-lockfile`.

## Dev Notes

- Touches the repo root plus every §5 directory; creates no business logic. Later stories fill in the placeholders — do NOT implement units/nutrition/schema here.
- ADRs applying: ADR-001, 003 (config keys only), 005–009. Do not add Prisma, Jest, Cypress, tRPC, or a `pages/` directory (rejected alternatives, architecture §2/§3).
- `pnpm-lock.yaml` must be committed (reproducible Docker builds, ADR-008).
- OUT of scope: Dockerfile (S-601), DB schema (S-201), instrumentation.ts boot hook (S-203), any real pages beyond placeholders (S-105+).
