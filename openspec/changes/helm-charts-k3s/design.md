# Design: helm-charts-k3s

## Context

The app is a single-process Node server backed by `better-sqlite3` (synchronous, in-process SQLite). `docker-compose.yml` already documents the hard constraint: no horizontal scaling, ever — concurrent writers against the same SQLite file corrupt data (NFR-6). The chart must make this a structural property of the deployment, not just a comment. k3s ships the `local-path` storage provisioner and Traefik ingress controller by default — the chart should lean on both rather than requiring extra cluster add-ons.

## Goals / Non-Goals

**Goals:** a Helm chart that deploys the existing published image to k3s with persistent `/data` storage, health-checked, configurable via values, installable with zero mandatory overrides on a stock k3s cluster.

**Non-Goals:** multi-replica/HA (impossible with SQLite as-is), a chart CI/release pipeline (OCI push, appVersion automation) — noted as a future candidate, not built here. No application code, Dockerfile, or existing CI/CD changes.

## Decisions

1. **Replicas hardcoded to `1`, not a values-configurable field.** `docker-compose.yml`'s warning becomes structural: the Deployment template does not expose `replicaCount` in `values.yaml` at all, closing off the most common way someone accidentally corrupts the DB (`helm install --set replicaCount=3`).
2. **Deployment with `strategy: Recreate`, not `RollingUpdate`.** With a `ReadWriteOnce` PVC, a rolling update would try to start the new pod before the old one releases the volume — it would hang or, on some CSI drivers, double-mount. `Recreate` guarantees full teardown before the replacement starts. (A StatefulSet was considered — rejected: no benefit here since there's exactly one identity-less replica; a plain Deployment + Recreate is simpler and equally correct.)
3. **Persistence via PVC, default StorageClass `local-path`** (k3s's bundled provisioner), default size `1Gi`, `ReadWriteOnce`. Documented risk: `local-path` binds the volume — and therefore the pod — to whichever node it first schedules on. Acceptable for the target (a home/single- or few-node k3s cluster); a multi-node cluster needing true node-mobility would need a different StorageClass (e.g. Longhorn), left as a values override, not a default.
4. **Health probes mirror the existing Docker `HEALTHCHECK` timings**: readiness `initialDelaySeconds: 5, periodSeconds: 5`; liveness `initialDelaySeconds: 15, periodSeconds: 15, failureThreshold: 3` — both `GET /api/health` on port 3000, consistent with NFR-1's ≤10s startup budget.
5. **No Secrets, no ConfigMap.** The app has no credentials (single-user, no auth — PRD non-goal). The handful of env vars (`NEAR_MATCH_DEFAULT_THRESHOLD`; `DB_PATH`/`PORT`/`NODE_ENV` fixed, matching the image's contract) are inlined directly in the Deployment template from `values.yaml` — a ConfigMap would add a template for no real benefit at this size.
6. **Ingress optional, off by default** (`ingress.enabled: false`), generic template (not Traefik-specific annotations) so it works with k3s's bundled Traefik via `ingressClassName` or any other controller the user swaps in. Default install exposes a `ClusterIP` Service; `NodePort` is a values override for bare access without an ingress controller.
7. **Image defaults to `ghcr.io/vezril/dionysus-planner:latest`**, `pullPolicy: IfNotPresent`. `latest` is a reasonable zero-config default for a personal deployment; pinning to a specific released tag is recommended in the chart's README/NOTES but not enforced.

## Risks / Trade-offs

- [`local-path` pins the pod to one node] → documented default, override path exists (Decision 3); acceptable for the stated target.
- [`Recreate` strategy means brief downtime on every upgrade] → acceptable given SQLite's single-writer constraint makes zero-downtime rollout impossible anyway without a storage-backend change.
- [No verification cluster available in this environment] → `helm lint` + `helm template` (default and overridden values) are the guaranteed-available floor; a real `helm install` against a local k3s/kind cluster is attempted if Docker/kind is available, mirroring the rigor of `scripts/docker-smoke.sh`, and explicitly flagged if it can't be run.

## Open Questions

- Chart OCI publishing / appVersion automation tied to release tags (mirroring the dual-registry Docker publish pattern) — deferred; a future change if wanted.
