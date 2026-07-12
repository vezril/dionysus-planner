# ci-pr-gate

## ADDED Requirements

### Requirement: PR verification workflow
The repository SHALL run a GitHub Actions workflow (`ci.yml`) on every pull request targeting `main` and every push to `main`, consisting of three jobs named exactly `checks`, `e2e`, and `docker-smoke`.

#### Scenario: PR triggers all three jobs
- **WHEN** a pull request is opened or updated against `main`
- **THEN** the `checks`, `e2e`, and `docker-smoke` jobs all execute on the PR's merge candidate

### Requirement: checks job gates static quality and fast tests
The `checks` job SHALL fail unless `pnpm lint`, `npx tsc --noEmit`, `pnpm test:unit`, and `pnpm test:integration` all exit 0, using Node 22 and the pnpm version pinned by `package.json`'s `packageManager` field.

#### Scenario: boundary-rule violation fails the job
- **WHEN** a PR introduces an import of `better-sqlite3` outside `data/**` (or another ESLint layer-boundary violation)
- **THEN** the `checks` job fails and reports the lint error

#### Scenario: failing unit or integration test fails the job
- **WHEN** any vitest test fails
- **THEN** the `checks` job exits non-zero

### Requirement: e2e job runs the full Playwright surface
The `e2e` job SHALL build the app and run `pnpm test:e2e` with all configured projects — the chromium/firefox/webkit/mobile-375 matrix and the dependent `isolated-chromium` project — installing browsers via `playwright install --with-deps` (cache keyed on the Playwright version).

#### Scenario: any browser project failure fails the job
- **WHEN** a test fails in any Playwright project, including the isolated-server suites
- **THEN** the `e2e` job exits non-zero and uploads the Playwright report as an artifact

### Requirement: docker-smoke job gates the container
The `docker-smoke` job SHALL build the production image and run `scripts/docker-smoke.sh` unmodified, so a PR fails if the image does not build, does not become healthy within 10 s, does not seed exactly the bundled catalog, loses data across recreate, requires network at runtime, or exceeds the 500 MB size budget (NFR-4).

#### Scenario: image over budget fails the PR
- **WHEN** a PR change pushes the built image size above 500 MB
- **THEN** the `docker-smoke` job fails with the size assertion from the smoke script

### Requirement: merges into main require green CI
The `protect-main` ruleset SHALL list `checks`, `e2e`, and `docker-smoke` as required status checks after the first successful workflow run, so a pull request cannot merge while any of the three is failing or pending.

#### Scenario: red PR cannot merge
- **WHEN** a pull request has a failing `e2e` check
- **THEN** GitHub blocks the merge until the check passes
