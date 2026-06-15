# gesetze-normen-db-service

Laws and legal norms reference database.

## Rendered resources

| Resource | Condition |
|----------|-----------|
| Deployment | always |
| Service | `service.enabled: true` (default) |
| ServiceAccount | `serviceAccount.create: true` (default: `false`) |
| HorizontalPodAutoscaler | `autoscaling.enabled: true` |
| Ingress | `ingress.enabled: true` |

## Key values

| Value | Default | Description |
|-------|---------|-------------|
| `namespaceOverride` | `''` | Target namespace for all resources. Empty → release namespace (`helm install --namespace`). |
| `image.repository` | `<container-registry>/gesetze-normen-db` | Container image repository. |
| `image.tag` | `<image-tag>` | Image tag. Empty string → `Chart.appVersion`. |
| `image.pullPolicy` | `Always` | Image pull policy. |
| `replicaCount` | `2` | Pod replicas when autoscaling is disabled. |
| `labels.app.kubernetes.io/component` | `agent` | Kubernetes component label applied to chart resources. |
| `labels.environment` | `''` | Environment label. Populated via `global.labels.environment` when deployed through an umbrella. |
| `env` | `[]` | Baseline environment variables for this chart (Kubernetes `EnvVar` objects). These win over any `global.env` or `global.extraEnv` entry of the same name. |
| `extraEnv` | `[]` | Additional environment variables with the highest precedence. Entries here overwrite `env`, `global.env`, and `global.extraEnv` for the same variable name. Use in the parent umbrella `values.yaml` for chart-specific configuration. |

## Environment variable precedence

When this chart is deployed as part of an umbrella, its container environment is assembled from four sources in order of increasing precedence:

| Priority | Source | Location |
|---|---|---|
| 1 — lowest | `global.env` | Umbrella `values.yaml` |
| 2 | `global.extraEnv` | Umbrella `values.yaml` |
| 3 | `env` | This chart's `values.yaml` |
| 4 — highest | `extraEnv` | Per-chart key in the umbrella `values.yaml` |

A variable defined in `env` or `extraEnv` at the chart level always overwrites a global variable with the same name.

## Install

```bash
helm upgrade --install gesetze-normen-db-service charts/sources/internal/04-shared-services/gesetze-normen-db-service \
  -f charts/sources/internal/04-shared-services/gesetze-normen-db-service/values.yaml \
  --namespace <namespace>
```

## Namespace behaviour

All resources are placed in the namespace set by `namespaceOverride`. When empty the release namespace is used — the value supplied via `helm install --namespace`.

The namespace must exist in the cluster before installation; this chart does not create namespace objects.
