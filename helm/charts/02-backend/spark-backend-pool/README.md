# spark-backend-pool

One pool of the SPARK Workflow backend modulith: a Deployment and a Service,
plus an optional HorizontalPodAutoscaler, KEDA ScaledObject and GMP
PodMonitoring. The `backend-services` umbrella references this chart once per
pool through dependency aliases:

```yaml
dependencies:
  - name: spark-backend-pool
    alias: document-management-service   # pool name, API_POOL, resource name
    repository: "file://../../02-backend/spark-backend-pool"
```

All pools run the same image with the same configuration. The alias gives a
pool its identity: `API_POOL` (and the `api.pool` OpenTelemetry resource
attribute) and the resource name `<release>-<alias>-<stage>`.

## Shared settings — `global.backend`

Set once per environment; see [values.yaml](values.yaml) for every key.

| Key | Purpose |
|---|---|
| `image.repository`, `image.tag` | The modulith image; `tag` may pin a digest (`<tag>@sha256:<digest>`) |
| `config` | Non-secret configuration. The `backend-services` umbrella renders it as ConfigMap `configMapName`; pools load it with `envFrom` and roll on every change (`checksum/config`) |
| `secretRefs` | Secrets loaded completely with `envFrom` |
| `env` | Single env vars for every pool, e.g. keys of consolidated Secrets (`valueFrom`) |
| `probes` | Startup/liveness/readiness probes (per pool overridable via `probes`) |
| `namespaceOverride` | Namespace of all pools |
| `keda.*` | Defaults of the KEDA ScaledObjects (Temporal endpoint, thresholds, behavior) |
| `denyMetricsPolicy` | Istio AuthorizationPolicy denying `/metrics` on the app port (rendered by the umbrella) |

`global.env` / `global.extraEnv` apply as in every leaf chart, with lower
precedence than `global.backend.env` and the pool's `env`.

## Per-pool settings

| Key | Purpose |
|---|---|
| `pool.worker` | `ACTIVE_FEATURE_WORKER` — the Temporal worker the pool runs (`none` = HTTP only) |
| `replicaCount`, `resources` | Sizing; `replicas` is omitted when an autoscaler owns it |
| `autoscaling.*` | CPU/memory HPA |
| `keda.enabled`, `keda.taskQueue` | KEDA ScaledObject with activity + workflow Temporal triggers on the task queue (`keda.triggers` replaces them) |
| `podMonitoring.*` | Per-pool GMP scrape config (for namespaces without a namespace-wide PodMonitoring) |
| `fullnameOverride` | Keep the resource names of an existing deployment |

`autoscaling` and `keda` are mutually exclusive (KEDA manages its own HPA).

## Selectors

Pods are selected by `app.kubernetes.io/name` + `app.kubernetes.io/instance`.
`global.legacyAppSelector: true` switches to the selector `app: <fullname>`,
which a migration from a Kustomize-based deployment needs to adopt its
Deployments (a Deployment's selector is immutable). Every pod carries
`app.kubernetes.io/part-of: spark-backend`.
