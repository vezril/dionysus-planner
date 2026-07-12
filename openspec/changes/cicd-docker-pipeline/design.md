# Design: cicd-docker-pipeline

## Context

The repo is a Next.js 15 modular monolith (pnpm 11, Node 22 pins, better-sqlite3 native module) with three test tiers (`pnpm test:unit`, `test:integration`, `test:e2e`) plus a Docker smoke suite (`pnpm docker:smoke`). E2e uses Playwright with five projects: a chromium/firefox/webkit/mobile-375 matrix against a shared `pnpm start` webServer, plus an `isolated-chromium` project (depends on the other four) that boots its own servers on ports 3210/3220. `main` requires PRs via the `protect-main` ruleset (id 18819474) but has no required status checks. No workflows exist.

## Goals / Non-Goals

**Goals:**
- Every PR to `main` automatically runs the full existing quality surface; merging red becomes impossible.
- Version tags publish a pullable image to GHCR with immutable version tags.
- Zero new secrets: everything runs on `GITHUB_TOKEN`.

**Non-Goals:**
- No new tests or quality gates beyond what exists locally (CI wraps, it does not invent).
- No CD to a live host (the user pulls the image themselves; NG-scope of a self-hosted app).
- No Docker Hub publishing, no multi-arch builds in v1 of this change (see Open Questions).
- No coverage reporting/badges.

## Decisions

1. **Two workflows, not one.** `ci.yml` (PR + push-to-main) and `release.yml` (tag `v*.*.*`). Rationale: independent triggers and permissions (`release` needs `packages: write`, `contents: write`; CI needs read-only). Alternative — single workflow with conditionals — rejected as harder to reason about and to wire into required checks.
2. **CI job split: `checks` (lint + typecheck + vitest), `e2e`, `docker-smoke` — three required checks.** Parallel jobs give faster feedback and isolate flake domains (a browser flake doesn't force rerunning the Docker build). Alternative — one mega-job — simpler but serial (~20 min) and all-or-nothing on rerun.
3. **Full Playwright matrix in CI, including `isolated-chromium`.** The suite is ~50 s locally; on ubuntu-latest with `--with-deps` install it stays well under budget, and NFR-10 (evergreen tri-engine) is an actual PRD requirement — chromium-only CI would silently drop it. Playwright browser binaries are cached keyed on the Playwright version.
4. **Docker smoke reuses `scripts/docker-smoke.sh` verbatim.** The script already asserts build success, health-within-10s, seed count == bundled file, durability across recreate, offline boot, and the NFR-4 ≤500 MB size budget. CI must not fork a second smoke path. GitHub runners have Docker preinstalled; the compose check runs with the plugin.
5. **GHCR over Docker Hub.** `ghcr.io/vezril/dionysus-planner`, auth via `GITHUB_TOKEN` — no external account, secrets, or token rotation. Package visibility public (follows repo). Alternative — Docker Hub — needs PAT secrets and an account tie-in; deferred unless the user asks.
6. **Release tagging: `X.Y.Z` (immutable) + `latest`, from tag `vX.Y.Z`.** The workflow refuses to overwrite an existing version tag (immutability check via manifest inspection before push). A GitHub Release is created from the tag with generated notes.
7. **Required status checks added to the existing ruleset by exact job names** (`checks`, `e2e`, `docker-smoke`) via `gh api` PUT on ruleset 18819474 — applied as an implementation task AFTER the first successful CI run on a PR (GitHub requires check names to have been reported at least once to select them; adding names preemptively works via API but verifying against a real run avoids typos bricking merges).
8. **pnpm/Node setup:** `actions/setup-node@v4` with Node 22 + `corepack enable`; pnpm store cached via `actions/cache` keyed on `pnpm-lock.yaml`. The `packageManager` pin in package.json drives the pnpm version — no version duplication in workflows.

## Risks / Trade-offs

- [E2e flake on shared runners (slower CPU than dev machine)] → timings are generous (2 s budgets vs ~150 ms actuals); Playwright `retries: 2` already configured for CI via `process.env.CI`; isolated-server project ordering already prevents the load-collision failure mode seen locally.
- [Docker layer rebuild cost per PR (~3–5 min uncached)] → use `docker/build-push-action` with GitHub Actions cache (`cache-from/to: type=gha`) in both workflows.
- [Required checks lock the repo if a workflow is renamed] → job names are part of the contract; renaming requires updating the ruleset in the same PR (called out in tasks + a comment in ci.yml).
- [GHCR package is public — anyone can pull] → intended; repo is public, image contains only public code + public-domain USDA data.

## Migration Plan

Deploy: merge the workflows PR (checks can't be required yet on that first PR), observe a green run, then apply the ruleset update task. Rollback: remove required checks from the ruleset (one API call), then delete/disable workflows.

## Open Questions

- Multi-arch (`linux/arm64` for a Pi/NAS target)? Deferred — OQ-4's reference hardware is still unpinned; single `linux/amd64` for now, arm64 is a one-line `platforms` addition later.
- Nightly scheduled run of the full suite against `main`? Deferred until there's drift risk (dependabot etc.).
