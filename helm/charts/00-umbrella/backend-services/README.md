# backend-services

Helm umbrella chart for the SPARK Workflow backend layer: the `spark-backend`
modulith, deployed as independently scaled pools.

## What this chart contains

| Chart / alias | Description |
|---|---|
| `spark-backend-pool` × 15 | One alias per pool of the modulith — `administrative-file-draft`, `agent-orchestration-service`, `comment-service`, `document-management-service`, `examination-service`, `feedback-service`, `formal-completeness-check`, `fpp-service`, `identity-management-service`, `objections-management-service`, `plausibility-notes`, `project-logic-service`, `protocol-service`, `supplementary-requests-service`, `temporal-job-service` |

The umbrella itself renders the objects the pools share: ConfigMap
`global.backend.configMapName` from `global.backend.config`, and — with
`global.backend.denyMetricsPolicy.enabled` — the Istio AuthorizationPolicy
that denies `/metrics` on the app port for every pool.

Pool defaults in [values.yaml](values.yaml) define per pool the replicas,
resources, the Temporal worker (`pool.worker`) and the KEDA task queue of the
four worker pools. Scaling (`autoscaling`, `keda`) and per-pool monitoring are
off by default — they need cluster add-ons (KEDA, GMP) and are enabled per
environment. See [spark-backend-pool](../../02-backend/spark-backend-pool/README.md)
for the keys.

## Installing

```bash
helm dependency update
helm upgrade --install backend-services . \
  -f values.yaml \
  --namespace backend-services \
  --create-namespace
```

## Enabling and disabling subcharts

Every pool is toggled by its `enabled` flag:

```yaml
temporal-job-service:
  enabled: false
```

## Namespace behaviour

The layer default is `global.namespaceOverride: backend-services`. All pools
(and the shared ConfigMap/AuthorizationPolicy) follow
`global.backend.namespaceOverride` when it is set; a single subchart still
honours its own `namespaceOverride`:

```yaml
global:
  backend:
    namespaceOverride: my-backend
```

When no override is set, the release namespace is used.
Namespace objects are not created by this chart.

## global values

Keys under `global` are forwarded to every subchart by Helm's subchart
global mechanism.

| Key | Effect |
|---|---|
| `global.stage.name` | Suffix appended to resource names. Leave empty for no suffix. |
| `global.labels.environment` | Value of the `environment` pod label on all workloads. |
| `global.env` | Shared baseline env injected into every container. |
| `global.extraEnv` | Additional shared env merged after `global.env`. |

Stage name and shared environment variables are injected by a parent umbrella
via `global.stage` and `global.env` / `global.extraEnv`. When installed
standalone, set those values directly in your `values.yaml`.

## Environment variables

Container environments are assembled from four sources in order of increasing
precedence:

| Priority | Source | How to set |
|---|---|---|
| 1 — lowest | `global.env` | Umbrella `values.yaml` |
| 2 | `global.extraEnv` | Umbrella `values.yaml` |
| 3 | `<chart>.env` | Leaf chart `values.yaml` |
| 4 — highest | `<chart>.extraEnv` | Per-chart key in the umbrella `values.yaml` |

Chart-specific entries always overwrite global entries of the same name.

## Per-subchart configuration

Any value key supported by a subchart can be set under that subchart's name:

```yaml
comment-service:
  replicaCount: 3
  resources:
    requests: {cpu: 100m, memory: 512Mi}
```

## Terminology

| Term | Meaning |
|---|---|
| **umbrella chart** | A chart whose role is to bundle and compose other charts as dependencies. This chart renders no resources of its own. |
| **subchart** / **leaf chart** | A chart listed as a dependency that renders actual Kubernetes resources. |
| **release namespace** | The namespace passed via `helm install --namespace`. |
| `namespaceOverride` | Per-subchart value that routes resources to a specific namespace. |
| **global values** | Values under the `global` key, propagated by Helm to every subchart. |
| `env` | Baseline env in a leaf chart's `values.yaml`. Takes precedence over global env. |
| `extraEnv` | Highest-precedence env, set per chart in the install values file. |
| **dependency archive** | `.tgz` in an umbrella's `charts/` produced by `helm dependency update`. Rebuild whenever a subchart changes. |
