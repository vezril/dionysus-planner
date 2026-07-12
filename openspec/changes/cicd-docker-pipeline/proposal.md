# Proposal: cicd-docker-pipeline

## Why

`main` is now PR-protected (ruleset `protect-main`), but no automation runs on PRs — every quality gate the project has (486 vitest tests, 90 Playwright e2e, lint/boundary rules, the Docker build + smoke suite) exists only as local scripts, so a red PR can merge unchecked and a broken image can ship. CI must make the existing gates automatic, and a release pipeline must publish the Docker image so the self-hosted deployment can pull instead of building locally.

## What Changes

- Add a GitHub Actions **CI workflow** running on PRs to `main` (and pushes to `main`): lint, typecheck, unit + integration tests, Playwright e2e (full browser matrix, including the isolated-server project), and a Docker build + smoke job reusing `scripts/docker-smoke.sh`.
- Add a **release workflow**: pushing a version tag (`vX.Y.Z`) builds the production image and publishes it to **GHCR** (`ghcr.io/vezril/dionysus-planner`) tagged `X.Y.Z` and `latest`, then creates a GitHub Release.
- Wire the CI jobs into the existing `protect-main` ruleset as **required status checks**, so PRs cannot merge red.
- Enforce the NFR-4 image-size budget (≤500 MB) as a CI assertion (already checked inside the smoke script; surfaced as a job).

## Capabilities

### New Capabilities
- `ci-pr-gate`: automated verification of every PR to main — lint/typecheck/tests/e2e/docker-smoke must pass before merge.
- `release-publish`: tag-driven Docker image publishing to GHCR with immutable version tags plus `latest`, and a GitHub Release.

### Modified Capabilities
<!-- none — no existing runtime capability's requirements change; openspec/specs/ is empty (v1 predates OpenSpec adoption) -->

## Impact

- New files under `.github/workflows/` (`ci.yml`, `release.yml`); no application code changes.
- Repository settings: `protect-main` ruleset gains `required_status_checks`; GHCR package visibility follows the repo (public).
- Uses the built-in `GITHUB_TOKEN` (`packages: write`) — no external secrets required.
- CI runtime cost: full e2e matrix + Docker smoke per PR (~10–15 min per run on ubuntu-latest).
