# S-601: Docker packaging, compose & smoke test

**Epic:** E-6 Packaging | **Status:** TODO | **Depends on:** S-203 (boot flow + health), S-105
**Covers:** FR-28 (restart semantics in-container), FR-1 (seeded on first container run) / NFR-1, NFR-4, NFR-5, NFR-9

## Context

The app boots with migrate-then-seed and exposes `/api/health` (S-203). This story ships it: the multi-stage Dockerfile (specified nearly verbatim in architecture §7), the reference `docker-compose.yml`, and a scripted smoke test covering startup, durability, idempotent re-seed, offline operation, and image size. Read: architecture.md §7 (Dockerfile shape, ADR-010 Debian-slim rationale, volume/WAL notes, env vars, size budget), §9 Risks #1/#2/#5 (native-module smoke test as release gate; no-replicas warning), ADR-003 (standalone + serverExternalPackages), ADR-008 (corepack/pnpm pin); prd.md NFR-1/4/5/9.

## Acceptance Criteria

1. Given the Dockerfile, when `docker build` runs, then a multi-stage build (deps → builder → runner, all `node:22-slim`) produces an image where the runner contains only `.next/standalone`, `.next/static`, `public`, `/drizzle`, and `data/seed/seed-data.json` (architecture §7).
2. Given a fresh container with an empty mounted volume, when started, then it reaches a healthy state (HEALTHCHECK green via `/api/health`) within 10 s and the seeded ingredient count EQUALS the length of the bundled `data/seed/seed-data.json` (NFR-1, FR-1 mechanism — the ≥300 full-catalog assertion belongs to the post-S-204 final smoke re-run, epics.md step 10).
3. Given a running container with data written (pantry item, recipe, an overridden seeded ingredient), when stopped, removed, and recreated on the same volume, then all data is preserved, ingredient count is unchanged (no seed duplicates), and the override's values are intact (NFR-5, FR-28 AC).
4. Given the container run with networking disabled (`--network=none` except the published port check performed from the host side, or an internal-only network), when exercised, then all v1 functionality works — seed comes from the image, no outbound calls (NFR-9 AC).
5. Given the built image, when inspected, then uncompressed size ≤ 500 MB (NFR-4 AC).
6. Given `docker-compose.yml`, when read, then it documents the `/data` volume mount (`./dionysus-data:/data`), the env vars (`DB_PATH`, `PORT`, `NEAR_MATCH_DEFAULT_THRESHOLD`), contains NO `replicas` example, and carries the do-not-horizontally-scale warning (architecture §7, Risk #5).

## Tasks

- [ ] IMPL: `Dockerfile` per architecture §7 verbatim (corepack enable in EVERY pnpm stage; python3/make/g++ only in deps; runner copies the five listed artifacts; ENV defaults; VOLUME /data; HEALTHCHECK hitting `/api/health`; CMD `node server.js`) — verified by: `docker build` succeeds.
- [ ] IMPL: `docker-compose.yml` reference file with volume mount, env vars, no replicas, and Risk #5 comment — verified by: `docker compose up` reaches healthy.
- [ ] TEST: (smoke script, `scripts/docker-smoke.sh` or equivalent, runnable locally/CI) — build image; assert uncompressed size ≤ 500 MB via `docker image inspect` (NFR-4); run with a fresh temp volume; poll `/api/health` — healthy within 10 s of container start (NFR-1); assert seeded ingredient count == length of the bundled `seed-data.json` via the app (FR-1 mechanism at this sequence slot).
- [ ] IMPL: fix whatever the smoke exposes (typical: standalone tracing of the `better-sqlite3` `.node` binary — apply `outputFileTracingIncludes` per Risk #2 ONLY if the primary `serverExternalPackages` defense proves insufficient).
- [ ] TEST: (smoke script continued) durability + idempotent re-seed — write a pantry item + recipe via HTTP, override one seeded ingredient; `docker stop && docker rm` + recreate on the same volume; assert data present, ingredient count unchanged, override values intact (NFR-5, FR-28); assert WAL sidecar files live in the volume (architecture §7 WAL note).
- [ ] TEST: (smoke script continued) offline run — start the container with no outbound network access; exercise seed-backed catalog read, a pantry write, and WCIC via the published port; all succeed (NFR-9).
- [ ] IMPL: wire the smoke script as the release-gate check (a pnpm script, e.g. `pnpm docker:smoke`, per architecture Risk #1 — "build image, run it, hit /api/health", not just `next build`) — verified by: one clean end-to-end run.

## Dev Notes

- Touches `Dockerfile`, `docker-compose.yml`, `scripts/docker-smoke.sh`, possibly `next.config.ts` (tracing fallback only), package scripts. NO application-code changes otherwise.
- ADR-010 is locked: Debian-slim in ALL stages (never Alpine/musl) — identical base across build and run is the ABI-compatibility guarantee for `better-sqlite3` (§7 native-module note).
- `package.json` must already carry the pinned `packageManager` field (S-101) — corepack in the Dockerfile depends on it.
- The smoke test is deliberately a shell/CI script, not Vitest/Playwright — Docker is never the dev test loop (ADR-007).
- Do not add a reverse proxy, second container, or TLS — out of architecture scope (§10).
- Per instructions: no dedicated CI epic — this single story's scripted smoke is the CI-relevant check.
- Seed-count assertion is deliberately "count == bundled seed-data.json length", NOT "≥ 300": at this story's sequence slot the bundled file may still be S-203's sample. The FR-1 ≥300 full-catalog assertion runs in the FINAL smoke re-run after S-204 lands (epics.md step 10). S-204 is intentionally NOT a hard dependency of this story.
- OUT of scope: registry publishing/versioning strategy, reference-hardware benchmarking (OQ-4), backup tooling (NG-12).
