# Landingpage

Main SPARK Workflow web application.

## Rendered resources

| Resource | Condition |
|---|---|
| Deployment | always |
| Service | `service.enabled: true` (default) |
| ServiceAccount | `serviceAccount.create: true` (default: `false`) |
| HorizontalPodAutoscaler | `autoscaling.enabled: true` |
| Ingress | `ingress.enabled: true` |

## Key values

| Value | Default | Description |
|---|---|---|
| `namespaceOverride` | `''` | Target namespace for all resources. Empty → release namespace. |
| `image.repository` | `<container-registry>/landingpage-app` | Container image repository. |
| `image.tag` | `<image-tag>` | Image tag. Empty → `Chart.appVersion`. |
| `image.pullPolicy` | `Always` | Image pull policy. |
| `replicaCount` | `1` | Pod replicas when autoscaling is disabled. |
| `labels.app.kubernetes.io/component` | `landingpage` | Kubernetes component label applied to chart resources. |
| `labels.environment` | `''` | Environment label. Populated via `global.labels.environment` from a parent umbrella. |
| `env` | `[]` | Baseline environment variables (Kubernetes `EnvVar` objects). Win over `global.env` and `global.extraEnv` on name collisions. |
| `extraEnv` | `[]` | Highest-precedence environment variables. Overwrite `env`, `global.env`, and `global.extraEnv` for the same variable name. |

## Environment variable precedence

When deployed as part of an umbrella, the container environment is assembled
from four sources in order of increasing precedence:

| Priority | Source | Location |
|---|---|---|
| 1 — lowest | `global.env` | Umbrella `values.yaml` |
| 2 | `global.extraEnv` | Umbrella `values.yaml` |
| 3 | `env` | This chart's `values.yaml` |
| 4 — highest | `extraEnv` | Per-chart key in the umbrella `values.yaml` |

A variable defined at chart level always overwrites a global variable of the
same name.

## Installing

```bash
helm upgrade --install landingpage charts/sources/internal/01-frontend/landingpage \
  -f charts/sources/internal/01-frontend/landingpage/values.yaml \
  --namespace <namespace>
```

## Namespace behaviour

All resources are placed in the namespace set by `namespaceOverride`. When
empty, the release namespace supplied via `helm install --namespace` is used.
The namespace must exist before installation — this chart does not create it.
