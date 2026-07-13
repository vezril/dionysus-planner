# Tasks: helm-charts-k3s

## 1. Chart scaffold

- [x] 1.1 `charts/dionysus-planner/Chart.yaml` — name, description, `version: 0.1.0`, `appVersion` matching the latest published image tag.
- [x] 1.2 `charts/dionysus-planner/values.yaml` — `image.{repository,tag,pullPolicy}`, `env.nearMatchDefaultThreshold` (default `3`), `persistence.{storageClass,size,accessMode}` (defaults `local-path`/`1Gi`/`ReadWriteOnce`), `service.{type,port}` (default `ClusterIP`/`3000`), `resources.{requests,limits}` (small home-lab defaults), `ingress.{enabled,className,host,annotations}` (default disabled). No `replicaCount` field (Decision 1).
- [x] 1.3 `charts/dionysus-planner/templates/_helpers.tpl` — standard name/labels helpers.

## 2. Workload templates

- [x] 2.1 `templates/deployment.yaml` — `replicas: 1` hardcoded, `strategy: Recreate`, container env from values (`DB_PATH=/data/dionysus.db`, `PORT=3000`, `NODE_ENV=production` fixed; `NEAR_MATCH_DEFAULT_THRESHOLD` from values), volume mount `/data`, readiness/liveness probes per design Decision 4, resources from values.
- [x] 2.2 `templates/pvc.yaml` — PVC per design Decision 3.
- [x] 2.3 `templates/service.yaml` — ClusterIP/NodePort per values, port 3000.
- [x] 2.4 `templates/ingress.yaml` — gated on `.Values.ingress.enabled`, generic (no hardcoded controller-specific annotations beyond what values supplies).
- [x] 2.5 `templates/NOTES.txt` — post-install instructions (port-forward command, or ingress host if enabled; note on `local-path` node-pinning from design Decision 3).

## 3. Verification

- [x] 3.1 `helm lint charts/dionysus-planner` clean.
- [x] 3.2 `helm template` with default values AND with an overridden values file (custom image tag, ingress enabled, custom resources) — both render valid YAML; replicaCount override confirmed silently ignored (replicas: 1 either way). Verified locally and wired as a CI check (task 3.4).
- [x] 3.3 SKIPPED — no reachable cluster in this environment (homelab k3s `nevermore.homelab` is off-LAN from the sandbox; Docker Desktop k8s not running; no kind/k3d installed). Human chose to skip rather than install kind here (design.md's pre-agreed fallback). Verified instead: `helm lint` clean, `helm template` renders valid YAML with default AND overridden values (custom image tag, ingress enabled, custom resources), and an explicit `replicaCount: 5` override in the values file is silently ignored — `replicas: 1` still renders. Real-cluster install is the user's responsibility on their own k3s.
- [x] 3.4 Add a `helm lint` step to the existing CI `checks` job (or a small dedicated job) so the chart can't silently bit-rot.

## 4. Docs

- [x] 4.1 README: k3s/Helm install section (`helm install dionysus-planner charts/dionysus-planner`), pointing out the fixed single-replica constraint and the `local-path` node-pinning caveat.

## 5. Ship

- [x] 5.1 PR through the CI gate.
