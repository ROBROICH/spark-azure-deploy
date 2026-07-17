# spicedb

Self-contained Helm chart for SpiceDB authorization infrastructure.

All Kubernetes resources are templated directly — there is no external chart
dependency. This gives full control over naming, labels, and RBAC.

> **External images:** This chart references public SpiceDB images from GHCR.
> These images are external dependencies and are not published or maintained in
> the Spark Workflow repository.

## What this chart creates

### Operator (namespace: `values.operator.namespace`, default `spicedb-operator`)

| Resource | Name | Notes |
|---|---|---|
| `ServiceAccount` | `spicedb-operator` | Operator identity |
| `ClusterRole` | `spicedb-operator-crd-reader` | Cluster-wide CRD reader RBAC |
| `ClusterRoleBinding` | `spicedb-operator-crd-reader` | Binds ClusterRole to ServiceAccount |
| `Role` | `spicedb-operator` | Namespaced operator RBAC in the cluster namespace |
| `RoleBinding` | `spicedb-operator` | Binds Role to ServiceAccount |
| `Deployment` | `spicedb-operator` | Operator controller process |
| `ConfigMap` | `update-graph` | SpiceDB image registry path for channel-based upgrades |

### Cluster (namespace: `values.cluster.namespace`, default `spicedb`)

| Resource | Notes |
|---|---|
| `SpiceDBCluster` CR | Name is derived from the release/chart fullname; reconciled by the operator into actual SpiceDB pods |
| `ServiceAccount` (spicedb) | SpiceDB pod identity, with `imagePullSecrets` |
| `ServiceAccount` (default) | Default SA with `imagePullSecrets` for init containers |
| `Cluster` (CNPG) | Optional CNPG-managed PostgreSQL backend (when `cluster.database.enabled: true`) |

## Chart tree

```
/charts
└── 03-infrastructure/
    └── spicedb/
        └── templates/
            ├── operator/
            │   ├── serviceaccount.yaml
            │   ├── clusterrole.yaml
            │   ├── clusterrolebinding.yaml
            │   ├── deployment.yaml
            │   └── configmap.yaml          (update-graph)
            └── cluster/
                ├── spicedbcluster.yaml
                ├── serviceaccounts.yaml
                └── database.yaml           (CNPG Cluster — optional)
```

## Namespace behaviour

Only the **operator** gets its own dedicated namespace. All cluster-side
resources use the release namespace by default:

| Domain | Namespace |
|---|---|
| Operator controller resources (Deployment, ServiceAccount, ConfigMap) | `operator.namespace` — default `spicedb-operator` |
| Operator cluster-scoped RBAC (ClusterRole, ClusterRoleBinding) | Cluster-scoped |
| Operator namespaced RBAC (Role, RoleBinding) | `cluster.namespace` — defaults to `.Release.Namespace` |
| Cluster resources (SpiceDBCluster CR, ServiceAccounts, CNPG database) | `cluster.namespace` — defaults to `.Release.Namespace` |

Set `cluster.namespace` explicitly when you need to separate the SpiceDB
data plane from the release namespace:

```yaml
cluster:
  namespace: "spicedb"  # override only if needed
```

## Installing

```bash
helm upgrade --install spicedb . \
  -f values.yaml \
  --namespace <release-namespace> \
  --create-namespace
```

Operator controller resources land in `operator.namespace` (default: `spicedb-operator`).
The operator Role and RoleBinding land in `cluster.namespace` (defaults to the
release namespace). Cluster resources also land in `cluster.namespace`.

The `SpiceDBCluster` CR reads its runtime credentials from a Kubernetes Secret
in the cluster namespace. This Secret must be pre-created before the operator
reconciles the CR.

**Secret name:** `cluster.secretName` (default: `spicedb-config`)
**Namespace:** `cluster.namespace` (defaults to release namespace)

Required keys:

| Key | Description |
|---|---|
| `preshared_key` | Shared secret used by SpiceDB clients to authenticate |
| `datastore_uri` | PostgreSQL connection URI, e.g. `postgres://user:pass@host:5432/spicedb` |

Create it before installing:

```bash
kubectl create secret generic spicedb-config \
  --namespace <release-namespace> \
  --from-literal=preshared_key='<key>' \
  --from-literal=datastore_uri='postgres://user:pass@host:5432/spicedb'
```

This chart **does not** create or manage the secret.

## Configuration

### Two-domain structure

```yaml
operator:
  enabled: true
  namespace: spicedb-operator      # operator resources land here
  image:
    repository: "<registry>/infra/spicedb-operator"
    tag: "<image-tag>"
  imagePullSecrets:
    - name: <registry-pull-secret>
  updateGraph:
    spicedbImageName: "<registry>/infra/spicedb"

cluster:
  enabled: true
  namespace: spicedb               # cluster resources land here
  channel: ""                      # "" = pinned to config.image; "stable" = auto-upgrade
  secretName: spicedb-config
  config:
    datastoreEngine: postgres
    replicas: 1
    image: "<registry>/infra/spicedb:<image-tag>"
    imagePullSecrets:
      - <registry-pull-secret>     # plain strings — matches the operator API
```

The `SpiceDBCluster` resource name is derived from the Helm release/chart
fullname and has no cluster-level name override.

### Update channels

| `cluster.channel` | Behaviour |
|---|---|
| `""` (empty) | Operator uses `cluster.config.image` directly — no auto-upgrades. Recommended for production. |
| `"stable"` | Operator auto-upgrades SpiceDB via the stable channel graph using `updateGraph.spicedbImageName`. |

### CNPG PostgreSQL backend

An optional `postgresql.cnpg.io/v1` `Cluster` can be deployed alongside the
SpiceDB cluster when `cluster.database.enabled: true`. Requires the CNPG
operator (`cnpg-postgres` chart) to be installed.

```yaml
cluster:
  database:
    enabled: true
    instances: 1
    imageCatalogRef:
      apiGroup: postgresql.cnpg.io
      kind: ClusterImageCatalog
      name: postgresql
      major: 17
    storage:
      size: 10Gi
      storageClass: ""
```

## Key values reference

| Key | Default | Description |
|---|---|---|
| `operator.enabled` | `true` | Deploy the SpiceDB Operator |
| `operator.namespace` | `spicedb-operator` | Namespace for all operator resources |
| `operator.image.repository` | `<registry>/…/spicedb-operator` | Operator container image |
| `operator.updateGraph.spicedbImageName` | `<registry>/…/spicedb` | Image name used in the update-graph ConfigMap |
| `cluster.enabled` | `true` | Deploy SpiceDB cluster resources |
| `cluster.namespace` | `""` (release namespace) | Namespace for all cluster resources (defaults to release namespace) |
| `cluster.channel` | `""` | Update channel; `""` pins to `config.image` |
| `cluster.secretName` | `spicedb-config` | Name of the pre-created runtime Secret |
| `cluster.config.replicas` | `1` | Number of SpiceDB replicas |
| `cluster.config.image` | `<registry>/…/spicedb:<tag>` | Explicit SpiceDB image (used when `channel` is empty) |
| `cluster.database.enabled` | `true` | Deploy CNPG PostgreSQL backend |

## Placeholder reference

| Placeholder | Description |
|---|---|
| `<container-registry>` | Container image registry host and path prefix |
| `<image-tag>` | Image tag or `@sha256:<digest>` |
| `<storage-class>` | StorageClass name for PostgreSQL persistent volumes |
