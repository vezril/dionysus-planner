# helm-deployment

## ADDED Requirements

### Requirement: single-writer topology is structurally enforced
The chart SHALL deploy exactly one replica of the application, and this SHALL NOT be a configurable `values.yaml` field. The Deployment SHALL use `strategy: Recreate`.

#### Scenario: replica count cannot be overridden
- **WHEN** the chart is installed with any values file, including one attempting to set a replica count
- **THEN** exactly one pod runs the application, because no template field exposes replica count as configurable

#### Scenario: upgrade tears down before starting the replacement
- **WHEN** the Deployment is upgraded (image tag change, `helm upgrade`)
- **THEN** the existing pod fully terminates before the replacement pod starts, avoiding two pods holding the same volume

### Requirement: persistent storage for the SQLite database
The chart SHALL provision a PersistentVolumeClaim mounted at `/data`, sized and classed via `values.yaml` (default: `local-path` StorageClass, `1Gi`, `ReadWriteOnce`), so data survives pod restarts and upgrades.

#### Scenario: data survives a pod restart
- **WHEN** the pod is deleted and recreated (e.g. during an upgrade or a node restart)
- **THEN** the reattached PVC contains the same SQLite database file, WAL sidecars included

### Requirement: health checks reflect the application's own startup contract
The chart SHALL configure readiness and liveness probes against `GET /api/health` on port 3000, with timings consistent with the application's documented ≤10s startup budget (NFR-1).

#### Scenario: pod reports ready only once healthy
- **WHEN** the pod starts
- **THEN** it is not marked Ready until `/api/health` returns a successful response, and remains Ready thereafter unless the app becomes unresponsive

### Requirement: zero-mandatory-override install on stock k3s
The chart SHALL install successfully on an unmodified k3s cluster with no values overrides required, using k3s's bundled `local-path` StorageClass and, when ingress is enabled, its bundled Traefik ingress controller.

#### Scenario: default install succeeds
- **WHEN** `helm install` is run with only the chart's default `values.yaml`
- **THEN** a Deployment, PVC, and Service are created and the pod reaches Ready without requiring a StorageClass or ingress controller beyond what k3s ships

### Requirement: no credential or secret management
The chart SHALL NOT define or require any Kubernetes Secret, matching the application's single-user, no-authentication design.

#### Scenario: install requires no credential values
- **WHEN** the chart is installed
- **THEN** no values field, Secret template, or environment variable represents a credential of any kind
