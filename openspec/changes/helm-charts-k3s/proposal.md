# Proposal: helm-charts-k3s

## Why

Deployment today is Docker-only (`docker run` / `docker-compose.yml`). The owner wants to run Dionysus Planner on a k3s cluster instead, which needs a Helm chart rather than raw compose.

## What Changes

- Add a Helm chart (`charts/dionysus-planner/`) that deploys the existing published image (`ghcr.io/vezril/dionysus-planner` or `calvinference/dionysus-planner`) to k3s: a Deployment pinned to **exactly 1 replica** (hard constraint — see design), a PersistentVolumeClaim for `/data` (k3s default `local-path` StorageClass), a Service, liveness/readiness probes against `/api/health`, and a values.yaml exposing image tag, storage size/class, env vars (`NEAR_MATCH_DEFAULT_THRESHOLD`), and ingress (optional, off by default).
- No changes to application code, Dockerfile, or the existing CI/CD pipeline — this is a new, additive deployment artifact.

## Capabilities

### New Capabilities
- `helm-deployment`: a Helm chart that deploys the existing Docker image to a Kubernetes/k3s cluster with the single-writer SQLite constraint enforced structurally, not just by convention.

## Impact

- New directory `charts/dionysus-planner/` (Chart.yaml, values.yaml, templates/). No existing file changes.
- Deployment-only; does not affect the CI pipeline, the Docker image itself, or the app's runtime behavior.
- Chart must encode the same NFR-6 warning already documented in `docker-compose.yml`: SQLite is single-writer, so this is fundamentally a `replicas: 1` workload — not horizontally scalable without a different storage backend.
