# Tasks: cicd-docker-pipeline

## 1. CI workflow (ci.yml)

- [x] 1.1 Create `.github/workflows/ci.yml` triggered on `pull_request` → `main` and `push` → `main`, with a shared setup pattern: checkout, `actions/setup-node@v4` (Node 22), `corepack enable`, pnpm store cache keyed on `pnpm-lock.yaml`, `pnpm install --frozen-lockfile`.
- [x] 1.2 Add job `checks`: `pnpm lint`, `npx tsc --noEmit`, `pnpm test:unit`, `pnpm test:integration`. Verified by: intentionally failing lint on a scratch branch fails the job (or by first real green run).
- [x] 1.3 Add job `e2e`: `pnpm build`, Playwright browser install `--with-deps` (cached on Playwright version), `pnpm test:e2e` (all projects incl. isolated-chromium), upload `playwright-report/` as artifact on failure. Add a comment noting job names are wired into branch protection — renames must update the ruleset.
- [x] 1.4 Add job `docker-smoke`: run `pnpm docker:smoke` (script unmodified); enable BuildKit GHA layer cache if the script's build step supports it without modification, otherwise plain build.
- [ ] 1.5 Push branch, open PR, confirm all three jobs green; fix any CI-environment-only issues (browser deps, docker compose plugin availability) without weakening any gate.

## 2. Release workflow (release.yml)

- [x] 2.1 Create `.github/workflows/release.yml` triggered on tag push `v*.*.*`, permissions `contents: write, packages: write`; login to GHCR with `GITHUB_TOKEN`.
- [x] 2.2 Add immutability guard: fail before building/pushing if `ghcr.io/vezril/dionysus-planner:<version>` already exists (manifest inspect).
- [x] 2.3 Build and push image tagged `<version>` and `latest` (docker/build-push-action, `cache-from/to: type=gha`, linux/amd64).
- [x] 2.4 Create GitHub Release with generated notes after successful publish (`gh release create` or softprops action).
- [ ] 2.5 After merge: push tag `v1.0.0`, verify `docker pull ghcr.io/vezril/dionysus-planner:1.0.0` works and the GitHub Release exists; verify re-running the same tag is refused.

## 3. Branch protection wiring

- [ ] 3.1 After the first green CI run on the PR, update ruleset 18819474 via `gh api` to add `required_status_checks` for `checks`, `e2e`, `docker-smoke` (integration_id/context names exactly as reported by the run).
- [ ] 3.2 Verify: `gh api repos/vezril/dionysus-planner/rules/branches/main` lists the required checks; confirm a PR with a pending check shows merge blocked.

## 4. Docs

- [x] 4.1 Update README with CI badge, the release procedure (tag `vX.Y.Z` → GHCR image), and the pull-and-run deployment snippet (`docker pull ghcr.io/vezril/dionysus-planner:latest`).
