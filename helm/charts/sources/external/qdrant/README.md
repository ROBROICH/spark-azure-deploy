# qdrant

Helm wrapper chart for the Qdrant vector database.

Thin project wrapper around the official [`qdrant/qdrant`](https://qdrant.github.io/qdrant-helm)
Helm chart (version 1.17.0, appVersion v1.17.0). Deploys Qdrant as a
three-replica clustered StatefulSet with persistent storage and project-managed
image references.

## What this chart creates

All resources are rendered by the upstream `qdrant/qdrant` dependency. The
wrapper layer adds project-specific defaults for:
- container registry and image tag (mirrored to the internal registry)
- three replicas with cluster mode enabled
- resource requests/limits tuned for production
- persistent volume sizing and StorageClass placeholder
- PodDisruptionBudget (`maxUnavailable: 1`)

## Installing

```bash
helm dependency update
helm upgrade --install qdrant . \
  -f values.yaml \
  --namespace <release-namespace> \
  --create-namespace
```

Qdrant resources use the release namespace. No `namespaceOverride` is set.
When deployed via `infrastructure-services`, the release namespace is inherited
from the umbrella install.

## Configuration

All keys under `qdrant:` are forwarded verbatim to the upstream chart.
Full upstream values reference:
<https://github.com/qdrant/qdrant-helm/blob/main/charts/qdrant/values.yaml>

### Key values

| Key | Default | Description |
|---|---|---|
| `qdrant.replicaCount` | `3` | Number of Qdrant StatefulSet replicas |
| `qdrant.image.repository` | `<registry>/infra/qdrant` | Container image |
| `qdrant.image.tag` | `""` | Image tag. Empty falls back to the chart appVersion `v1.17.0`; explicit overrides must be valid semver strings. |
| `qdrant.persistence.size` | `100Gi` | Persistent volume size per replica |
| `qdrant.persistence.storageClassName` | `<storage-class>` | StorageClass for PVCs |
| `qdrant.config.cluster.enabled` | `true` | Enable Qdrant distributed cluster mode |
| `qdrant.apiKey` | `false` | API key auth (`false` = disabled; in-cluster access controlled by Istio) |
| `qdrant.podDisruptionBudget.enabled` | `true` | Enable PDB |
| `qdrant.podDisruptionBudget.maxUnavailable` | `1` | Maximum unavailable replicas during disruptions |

### Ports

| Name | Port | Protocol |
|---|---|---|
| HTTP REST | 6333 | TCP |
| gRPC | 6334 | TCP |
| Internal P2P | 6335 | TCP |

### Cluster mode

`config.cluster.enabled: true` is required for multi-replica deployments.
With a single replica set `replicaCount: 1` and `config.cluster.enabled: false`.

## Placeholder reference

| Placeholder | Description |
|---|---|
| `<container-registry>` | Container image registry host and path prefix |
| `<storage-class>` | StorageClass name for persistent volumes |
