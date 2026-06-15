# SPARK Workflow — Helm Charts

This directory contains the complete Helm chart suite for the **SPARK Workflow**
application. Charts are organised in a strict five-layer hierarchy where each
layer is an independent umbrella that can be deployed alone or together through
the top-level `00-spark-workflow` umbrella.

---

## Directory Layout

```
charts/
├── 00-spark-workflow/          Top-level umbrella — assembles all layers
├── 01-basisdienste/            Layer 1 — shared infrastructure services
├── 02-frontend/                Layer 2 — SPARK Workflow SPA
├── 03-service-layer/           Layer 3 — all backend microservices
├── 04-orchestration-layer/     Layer 4 — Temporal workflow engine
├── 05-ai-module-layer/         Layer 5 — AI processing workers
└── sources/
    ├── external/               Wrapper charts for third-party upstreams
    │   ├── clamav/
    │   ├── docling-rq/
    │   ├── qdrant/
    │   ├── redis/
    │   ├── spicedb/
    │   ├── temporal/
    │   └── unoserver/
    └── internal/               Project-owned chart sources
        ├── 01-frontend/frontend/
        ├── 02-backend/         (15 backend service charts)
        ├── 04-shared-services/ (5 shared accessor/utility charts)
        └── temporal-worker/    Generic reusable Temporal worker base chart
```

Each layer umbrella's `Chart.yaml` lists its `file://` dependencies pointing into
`sources/`. The `sources/` charts are never deployed directly by end-users;
they are building blocks consumed by the layer umbrellas.

---

## Prerequisites

| Requirement                    | Notes                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Helm ≥ 3.12                    | Required for OCI and `file://` dependency support                                                                                                                                                       |
| Kubernetes ≥ 1.27              | Tested on GKE Autopilot and vanilla kubeadm clusters                                                                                                                                                    |
| Istio                          | No Istio CRDs or resources are bundled. Some charts include optional Istio sidecar annotations, and external Envoy/Istio infrastructure may be used outside this chart suite.                            |
| PostgreSQL endpoint            | SpiceDB requires a PostgreSQL connection URI supplied via the `spicedb-config` Secret (`datastore_uri` key). Any PostgreSQL provider works (CloudNativePG, RDS, Cloud SQL, etc.).                       |
| SpiceDB Operator ≥ 1.17        | Deployed via `01-basisdienste/spicedb`; namespaced watch mode requires v1.17+                                                                                                                           |
| Container registry pull secret | `imagePullSecrets` defaults to `[]` (disabled). If your images are in a private registry, set `imagePullSecrets: [{name: <registry-pull-secret>}]` in each chart's values or globally via the umbrella. |

### Cluster components not managed by this chart suite

The following components are **prerequisites** that must be installed and
running before `00-spark-workflow` can be deployed. They are not included in
the `charts/` tree and must be managed separately (e.g. by the platform team):

| Component                                 | Purpose                                                        | Why it is external                                                           |
| ----------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Envoy Gateway**                         | API routing and TLS termination for all services               | Cluster-wide networking infrastructure shared across namespaces              |
| **CloudNativePG operator + CNPG cluster** | PostgreSQL for Temporal and all backend services               | Stateful DB cluster with its own lifecycle; not co-deployed with application |
| **External Secrets Operator**             | Syncs secrets from Vault/external stores to Kubernetes Secrets | Cluster singleton; manages secrets across all namespaces                     |
| **Keycloak / OIDC provider**              | User authentication for frontend and backend services          | Shared identity service; not part of the application stack                   |
| **LiteLLM gateway**                       | LLM request routing and proxying for AI modules                | May be deployed on a separate GPU-accelerated cluster                        |
| **cert-manager** (optional)               | TLS certificate provisioning for Ingress / Gateway             | Cluster singleton                                                            |

Before the first install create the required secrets that are not managed by
this chart suite (SpiceDB runtime config, S3 credentials, CNPG credentials,
LiteLLM master key):

```bash
kubectl create secret generic spicedb-config \
  --from-literal=preshared_key=<key> \
  --from-literal=datastore_uri=<postgres-dsn> \
  -n <namespace>
```

---

## Quick Start

### Full-stack install

```bash
# 1. Resolve all transitive dependencies (run once, or after Chart.yaml changes)
helm dep update charts/00-spark-workflow

# 2. Install or upgrade
helm upgrade --install spark charts/00-spark-workflow \
  --namespace spark --create-namespace \
  --set global.stage.name=prod \
  -f my-overrides.yaml
```

### Deploy a single layer

Each layer umbrella is self-contained and can be installed independently:

```bash
helm dep update charts/04-orchestration-layer
helm upgrade --install spark charts/04-orchestration-layer \
  --namespace spark --create-namespace
```

### Render manifests without installing

```bash
helm dep update charts/00-spark-workflow
helm template spark charts/00-spark-workflow \
  --namespace spark \
  --set global.stage.name=dev \
  > rendered.yaml
```

### Dependency update workflow

After modifying `Chart.yaml` in any layer or source chart, run `helm dep update`
for every umbrella that (transitively) includes the changed chart:

```bash
# If a source chart changed:
helm dep update charts/01-basisdienste
helm dep update charts/00-spark-workflow

# If a layer umbrella changed:
helm dep update charts/00-spark-workflow
```

---

## Layer Reference

### Layer 0 — Top-level Umbrella (`00-spark-workflow`)

Assembles all five layers. The `values.yaml` in this chart contains **only**
layer-level `enabled` toggles and the global `stage.name`. All component
configuration lives in the respective layer's `values.yaml`.

Stage-specific or last-mile overrides pass through nested keys:

```yaml
# Override a single component via the umbrella:
orchestration-layer:
  temporal:
    temporal:
      web:
        replicaCount: 2
```

| Key                           | Default | Purpose                                     |
| ----------------------------- | ------- | ------------------------------------------- |
| `global.stage.name`           | `""`    | Stage suffix appended to all resource names |
| `basisdienste.enabled`        | `true`  | Deploy infrastructure layer                 |
| `frontend-layer.enabled`      | `true`  | Deploy frontend layer                       |
| `service-layer.enabled`       | `true`  | Deploy service layer                        |
| `orchestration-layer.enabled` | `true`  | Deploy orchestration layer                  |
| `ai-module-layer.enabled`     | `true`  | Deploy AI module layer                      |

---

### Layer 1 — Base Infrastructure (`01-basisdienste`)

Deploys long-running, stateful infrastructure shared by all application tiers.

| Subchart     | Source                        | Purpose                                          |
| ------------ | ----------------------------- | ------------------------------------------------ |
| `spicedb`    | `sources/external/spicedb`    | ReBAC authorization engine + namespaced operator |
| `qdrant`     | `sources/external/qdrant`     | Vector database for AI embeddings                |
| `unoserver`  | `sources/external/unoserver`  | Document format conversion (LibreOffice)         |
| `clamav`     | `sources/external/clamav`     | Antivirus scanning daemon                        |
| `docling-rq` | `sources/external/docling-rq` | Document intelligence pipeline (OCR, layout)     |

**SpiceDB RBAC model**: The SpiceDB Operator runs in namespace `spicedb-operator`
with a namespaced `Role` in the target data-plane namespace. A minimal
`ClusterRole` grants read-only CRD discovery. The operator's
`--watch-namespaces` flag restricts it to the declared `cluster.namespace`.

---

### Layer 2 — Frontend (`02-frontend`)

Deploys the React SPA served as a static Nginx container. Ingress is managed
externally (Envoy Gateway / Istio EnvoyFilter) — the chart creates only a
`ClusterIP` Service.

**Required VITE\_\* environment variables** are pre-populated with `<placeholder>`
values in `sources/internal/01-frontend/frontend/values.yaml`. Replace all
placeholders before deploying; the container entrypoint script will fail without
at least `VITE_API_BASE_URL`.

**Service naming**: Helm produces `{release}-frontend` (e.g. `spark-frontend`).
If Envoy Gateway HTTPRoutes or ReferenceGrants reference the old Kustomize name
(`demo-frontend-app`), those must be updated to match.

Resources rendered: 3 (Deployment, Service, test Pod).

---

### Layer 3 — Service Layer (`03-service-layer`)

Deploys all backend microservices grouped by functional domain. All services
share the same Helm chart template pattern from `sources/internal/02-backend/`
and `sources/internal/04-shared-services/`.

| Group                   | Services                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workflow-Dienste**    | `project-logic-service`, `temporal-job-service`, `document-management-service`, `agent-orchestration-service`                                   |
| **Interaktionsdienste** | `comment-service`, `supplementary-requests-service`, `identity-management-service`, `objections-management-service`                             |
| **Integrationsdienste** | `fpp-service`, `llm-client`                                                                                                                     |
| **Beschlussdienste**    | `administrative-file-draft`                                                                                                                     |
| **Datenbankdienste**    | `gesetze-normen-db-service`, `jura-db-service`, `gesetzesbegruendung-db-service`                                                                |
| **Prüfungsdienste**     | `formal-completeness-check`, `plausibility-notes`, `examination-service`, `protocol-service`, `feedback-service`, `rechtsaenderungs-monitoring` |

Resources rendered: ~57 per layer (Deployments, Services).

Disable a single service without changing `values.yaml`:

```bash
helm upgrade spark charts/03-service-layer \
  --set feedback-service.enabled=false
```

---

### Layer 4 — Orchestration Layer (`04-orchestration-layer`)

Deploys the Temporal workflow engine via `sources/external/temporal`, a thin
wrapper around the official `temporalio/temporal` Helm chart (v0.73.2,
appVersion 1.30.2). The chart appVersion does not by itself force the deployed
server image tag; `00-spark-workflow` values may still override it if they pin
`temporal.server.image.tag` to `1.29.1`.

**Temporal components deployed:**

| Component           | Resource                      | Address                                                  |
| ------------------- | ----------------------------- | -------------------------------------------------------- |
| `frontend`          | Deployment + Service          | `{release}-temporal-frontend:{release-ns}:7233`          |
| `internal-frontend` | Deployment + Service          | `{release}-temporal-internal-frontend:{release-ns}:7236` |
| `history`           | Deployment + headless Service | internal cluster use                                     |
| `matching`          | Deployment + headless Service | internal cluster use                                     |
| `worker`            | Deployment + headless Service | internal cluster use                                     |
| `web`               | Deployment + Service          | `{release}-temporal-web:{release-ns}:8080`               |
| `admintools`        | Deployment                    | tctl access pod                                          |
| `search-attributes` | post-install Job              | registers custom attributes                              |

The `internalFrontend` is explicitly enabled so that the `internal-frontend`
Service always has a matching Deployment. With it active, all Temporal server
processes use `USE_INTERNAL_FRONTEND=1` to route inter-service gRPC through the
dedicated internal endpoint.

Resources rendered: ~18 (including ConfigMaps for dockerize + dynamic config,
Deployments, Services, headless Services, and the post-install Job).

---

### Layer 5 — AI Module Layer (`05-ai-module-layer`)

Deploys all AI processing workers as independently scalable Temporal consumers.
Every module is a separate instance of the generic `sources/internal/temporal-worker`
chart, declared as a dependency alias in `Chart.yaml`.

| Alias                                  | Deployment name                           | Function                                 |
| -------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| `inhaltsextraktion`                    | `{release}-modul-inhaltsextraktion`       | Document content extraction              |
| `formale-vollstaendigkeitspruefung`    | `{release}-modul-formale-pruefung`        | Formal completeness check                |
| `plausibilitaetspruefung`              | `{release}-modul-plausibilitaet-pruefung` | Plausibility annotation                  |
| `materielle-vollstaendigkeitspruefung` | `{release}-modul-suche-und-zuordnung`     | Semantic search and norm assignment      |
| `einwendungsmanagement`                | `{release}-modul-einwendungsmanagement`   | Objection classification                 |
| `rechtliche-pruefung-und-bewertung`    | `{release}-modul-bewertung`               | Legal assessment                         |
| `rechtsmethodik`                       | `{release}-modul-rechtsmethodik`          | Legal methodology analysis               |
| `anonymisierung`                       | `{release}-modul-anonymisierung`          | PII anonymisation                        |
| `normenermittlung`                     | `{release}-modul-normenermittlung`        | Norm determination (vector search + LLM) |
| `risikohinweiser`                      | `{release}-modul-risikohinweiser`         | Risk identification                      |

**Adding a new worker** requires two steps:

1. Add a dependency in `05-ai-module-layer/Chart.yaml`:

   ```yaml
   - name: temporal-worker
     version: "0.1.0"
     repository: "file://../sources/internal/temporal-worker"
     alias: my-new-worker
     condition: my-new-worker.enabled
   ```

2. Add a configuration section in `05-ai-module-layer/values.yaml`:

   ```yaml
   my-new-worker:
     enabled: true
     nameOverride: "modul-my-new-worker"
     replicaCount: 1
     image:
       repository: my-worker-image
       tag: "1.0.0"
     env:
       - name: TEMPORAL_TASK_QUEUE
         value: my-queue
   ```

Resources rendered: 15 (Deployments and Services).

---

## Global Values

These keys are declared at the top level of any umbrella and forwarded
transparently to all subcharts:

| Key                     | Type   | Default | Description                                                                                                                                                             |
| ----------------------- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `global.stage.name`     | string | `""`    | Suffix appended to every resource name. E.g. `"dev"` → `spark-frontend-dev`. Leave empty for no suffix.                                                                 |
| `global.labels`         | map    | `{}`    | Labels merged into every resource's metadata. All key-value pairs are passed through as-is — see [Label and annotation merge model](#label-and-annotation-merge-model). |
| `global.annotations`    | map    | `{}`    | Annotations merged into every resource's metadata. Same flat-map merge as labels.                                                                                       |
| `global.podAnnotations` | map    | `{}`    | Annotations merged into every pod template. Local `podAnnotations` override global on conflict.                                                                         |
| `global.podLabels`      | map    | `{}`    | Extra labels merged into every pod template. Local `podLabels` override global on conflict.                                                                             |

---

## Configuration Patterns

### Namespace placement

By default all resources land in the release namespace supplied via
`helm install --namespace`. Three special exceptions use explicit hardcoded
namespaces:

| Resource                                     | Namespace                                 | Reason                                                  |
| -------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| SpiceDB Operator Deployment / ServiceAccount | `spicedb-operator`                        | Operator singleton; shares no namespace with data-plane |
| SpiceDB Operator `update-graph` ConfigMap    | `spicedb-operator`                        | Co-located with operator                                |
| SpiceDB `Role` / `RoleBinding`               | `cluster.namespace` (default: release ns) | Data-plane access scope                                 |

To override the namespace for an individual source chart, set its
`namespaceOverride` key in the relevant layer's `values.yaml`.

### Stage suffix

Setting `global.stage.name` appends a suffix to every resource name generated
by a stage-aware helper (`stageSuffix`). This enables multiple side-by-side
deployments in the same namespace:

```bash
helm upgrade --install spark-dev charts/00-spark-workflow \
  --namespace spark --set global.stage.name=dev

helm upgrade --install spark-prod charts/00-spark-workflow \
  --namespace spark --set global.stage.name=prod
```

Resulting resource names: `spark-dev-frontend-dev`, `spark-prod-frontend-prod`.

### Resource naming formula

Every internal source chart follows this deterministic naming chain:

```
fullname = {Release.Name}-{nameOverride|chartName}[-stageSuffix]
```

| Value              | Takes effect when                                                     |
| ------------------ | --------------------------------------------------------------------- |
| `fullnameOverride` | Bypasses the formula entirely; **stage suffix is not appended**       |
| `nameOverride`     | Replaces the chart name segment (keeps release prefix + stage suffix) |
| _(default)_        | `{Release.Name}-{Chart.Name}[-stageSuffix]`                           |

The stage suffix is derived with this precedence (first non-empty wins):
`values.stage.name` → `global.stage.name`

It is lowercased, dot-replaced with hyphens, and truncated to 10 characters.
The overall fullname is capped at 63 characters.

**Selector labels** are set from `fullname`, not the chart name alone:

```yaml
app.kubernetes.io/name: <chartName>
app.kubernetes.io/instance: <fullname> # unique per chart instance in a release
```

This means Service selectors and Deployment `matchLabels` both use `fullname`,
keeping charts that appear as multiple aliases in the same umbrella fully
isolated from each other.

### Label inheritance and spark-workflow labels

Every internal source chart emits a full set of Kubernetes recommended labels
plus two custom `spark-workflow.*` labels for layer/group identification.

#### Kubernetes recommended labels (applied to every resource)

| Label                          | Value                                          | Description                                 |
| ------------------------------ | ---------------------------------------------- | ------------------------------------------- |
| `helm.sh/chart`                | `<chart>-<version>`                            | Chart identity for tooling                  |
| `app.kubernetes.io/name`       | chart name                                     | Stable application name                     |
| `app.kubernetes.io/instance`   | release fullname                               | Unique per chart+release combo              |
| `app.kubernetes.io/version`    | chart `appVersion`                             | Application version                         |
| `app.kubernetes.io/managed-by` | `Helm`                                         | Required by Helm tooling                    |
| `app.kubernetes.io/component`  | `values.labels["app.kubernetes.io/component"]` | Functional role (backend, agent, worker, …) |
| `app.kubernetes.io/part-of`    | `spark-workflow`                               | Top-level application this belongs to       |

#### Spark-workflow labels

| Label                       | Example value      | Set at                                       |
| --------------------------- | ------------------ | -------------------------------------------- |
| `spark-workflow.layer/name` | `service-layer`    | Each layer umbrella's `global.labels` map    |
| `spark-workflow.group/name` | `workflow-dienste` | Each service's `labels` map within the layer |

Layer names used in this chart suite:

| Umbrella                 | `global.labels["spark-workflow.layer/name"]` | Groups (`spark-workflow.group/name`)                                                                                                                                                                       |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `02-frontend`            | `frontend-layer`                             | `frontend`                                                                                                                                                                                                 |
| `03-service-layer`       | `service-layer`                              | `workflow-dienste`, `interaktionsdienste`, `integrationsdienste`, `beschlussdienste`, `datenbankdienste`, `pruefungsdienste`                                                                               |
| `04-orchestration-layer` | `orchestration-layer`                        | `temporal`                                                                                                                                                                                                 |
| `05-ai-module-layer`     | `ai-module-layer`                            | `inhaltsextraktion`, `formale-pruefung`, `plausibilitaet-pruefung`, `suche-und-zuordnung`, `einwendungsmanagement`, `bewertung`, `rechtsmethodik`, `anonymisierung`, `normenermittlung`, `risikohinweiser` |

#### Label and annotation merge model

Labels, annotations, podAnnotations, and podLabels all share the **same flat-map merge model as env vars**. There are no special key lookups — every key-value pair in the source maps is passed through as-is:

```
1. global.labels / global.annotations / global.podAnnotations / global.podLabels
       — base map set by the layer umbrella, propagated to all subcharts
2. values.labels / values.annotations / values.podAnnotations / values.podLabels
       — per-service overrides; any key present here wins over the global map
```

In practice:

- The layer umbrella sets `spark-workflow.layer/name` in `global.labels` as a regular key. Every subchart in that layer automatically receives it.
- Individual service entries add `spark-workflow.group/name` to their own `labels` map.
- `app.kubernetes.io/part-of: spark-workflow` is set in `00-spark-workflow/values.yaml` → `global.labels` and propagates all the way down.
- Any arbitrary key can be injected at global or local level — the helper never inspects specific keys.

```yaml
# 00-spark-workflow/values.yaml — top-level labels for the whole suite
global:
  labels:
    app.kubernetes.io/part-of: spark-workflow

# 03-service-layer/values.yaml — layer sets its identity label
global:
  labels:
    spark-workflow.layer/name: service-layer

# individual service entry in 03-service-layer/values.yaml
project-logic-service:
  labels:
    spark-workflow.group/name: workflow-dienste   # local key, wins over global

# override from a stage values file or --set
project-logic-service:
  labels:
    spark-workflow.layer/name: custom-layer       # overrides global for this chart
```

`podAnnotations` and `podLabels` follow the same pattern with `global.podAnnotations` /
`global.podLabels` as the base and the per-service values as overrides.
`annotations` (resource metadata) works identically via `global.annotations`.

### Environment variable precedence

All project-owned service charts use a single `containerEnv` helper that merges
four sources in this order (later entries win on name collision):

```
1. global.env       — shared base vars forwarded from the umbrella
2. global.extraEnv  — shared override vars forwarded from the umbrella
3. values.env       — service-specific base vars (defined in the source chart)
4. values.extraEnv  — service-specific overrides (stage-specific additions)
```

The merge is **last-write-wins by name**: if the same `name` key appears in
multiple sources, the value from the highest-priority source is used. Lower
entries in the list cannot reintroduce a key that a higher entry already set.

**Inline template expansion**: any env `value` string containing `{{` is
evaluated through Helm's `tpl` function at render time. This is how in-cluster
FQDN templates work:

```yaml
# In values.yaml — stored as a raw string:
- name: TEMPORAL_SERVER_URL
  value: '{{ printf "%s-temporal-frontend.%s.svc.cluster.local:7233"
    .Release.Name .Release.Namespace }}'

# Rendered in the manifest — evaluated against the live release context:
- name: TEMPORAL_SERVER_URL
  value: "spark-temporal-frontend.spark.svc.cluster.local:7233"
```

`valueFrom` entries (secretKeyRef, configMapKeyRef) are passed through
unchanged — `tpl` is only applied to plain string `value` fields.

**Practical implication**: to inject a stage-specific override for a single env
var without replacing the entire `env` list, put it in `extraEnv`:

```yaml
# In a stage override file or via --set:
document-management-service:
  extraEnv:
    - name: LOG_LEVEL
      value: DEBUG
```

This adds `LOG_LEVEL=DEBUG` on top of whatever `env` defines, or overrides it
if it already exists there.

### Dynamic FQDN resolution

Cross-service addresses within the cluster are templated using
`.Release.Name`, `.Release.Namespace`, and `stageSuffix` so they resolve
correctly regardless of Helm release name or stage:

```yaml
# Temporal frontend address for a Temporal worker:
- name: TEMPORAL_SERVER_URL
  value: '{{ printf "%s-temporal-frontend.%s.svc.cluster.local:7233"
    .Release.Name .Release.Namespace }}'

# Docling service address:
- name: DOCLING_HOST
  value: '{{ printf "%s-docling-rq%s.%s.svc.cluster.local"
    .Release.Name (include "temporal-worker.stageSuffix" .) .Release.Namespace }}'
```

These templates are evaluated at deployment time via the `tpl` function.

### Environment label resolution

The `environment` label follows this priority chain (first non-empty wins):

```
1. stage.name  (values.stage.name → global.stage.name)
2. global.labels["environment"]
3. values.labels["environment"]  (chart-level)
4. omitted entirely
```

When a stage name is set it doubles as the environment label, so
`global.stage.name=prod` both appends `-prod` to resource names and
labels all pods with `environment: prod`.

### Image configuration

All images are prefixed with a container registry placeholder that must be
replaced before the first deployment:

```yaml
image:
  repository: "<container-registry>/<team>/<service>"
  tag: "<image-tag>"
```

Replace `<container-registry>` with your registry hostname (e.g.
`registry.example.com`) and `<image-tag>` with a pinned digest or tag.

### Propagating values from the top-level umbrella

Helm passes values down through the dependency tree using the dependency's
alias as the key. A three-level path is common:

```
00-spark-workflow/values.yaml
  └── orchestration-layer:          # alias of 04-orchestration-layer
        └── temporal:               # alias of sources/external/temporal
              └── temporal:         # upstream chart name inside the wrapper
                    └── web:
                          replicaCount: 2
```

For single-layer installs the path is one level shorter:

```
04-orchestration-layer/values.yaml
  └── temporal:                     # alias of sources/external/temporal
        └── temporal:
              └── web:
                    replicaCount: 2
```

---

## Placeholder Reference

Values containing `<...>` must be supplied before deployment. The table below
lists the placeholder categories and where they appear.

| Category           | Placeholder                                                         | Location                                         |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------ |
| Container registry | `<container-registry>`                                              | All `image.repository` fields                    |
| Image reference    | `<image>`                                                           | Full image reference overrides                   |
| Image tags         | `<image-tag>`                                                       | All `image.tag` fields                           |
| Registry secret    | `<registry-pull-secret>`                                            | `imagePullSecrets` examples                      |
| Object storage     | `<temporal-payloads-bucket>`, `<s3-region>`, `<object-storage-url>` | AI module `env` sections                         |
| LiteLLM            | `<litellm-api-url>`                                                 | AI module `env` sections                         |
| Database           | `<postgresdb-host>`, `<postgresdb-name>`, `<postgresdb-user>`       | Backend service `env` sections                   |
| Database secret    | `<db-secret>`                                                       | Database password Secret references              |
| Storage class      | `<storage-class>`                                                   | `qdrant.persistence`, `spicedb.database.storage` |
| Temporal CORS      | `<temporal-cors-origin>`                                            | `temporal.temporal.web.additionalEnv`            |
| Ingress domain     | `<app-domain>`, `<temporal-domain>`                                 | Ingress annotations and `tls`                    |
| Auth (OIDC)        | `<oidc-issuer>`, `<client-id>`, `<client-secret>`                   | `identity-management-service.env`                |

Use `grep -r '<' charts/` to find all remaining placeholders before deploying.

---

## Security Notes

> **Security Notice**: This chart suite is a reference and integration
> foundation. Configurations, defaults, and example values may be suitable for
> development or testing but must not be used in production without review and
> hardening by the operator.
>
> In particular:
>
> - All `<placeholder>` values must be replaced with production secrets managed
>   by an external secrets operator (e.g. External Secrets Operator with Vault).
> - `qdrant.apiKey: false` disables API key authentication; enable it in
>   production by supplying a key via a `secretKeyRef`.
> - SpiceDB's `preshared_key` must be a strong random secret; the chart does
>   not generate it automatically.

---

## Source Chart Structure

Each source chart under `sources/internal/02-backend/` and
`sources/internal/04-shared-services/` follows an identical template layout:

```
<service>/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── NOTES.txt
    ├── _helpers.tpl      Fullname, labels, stage suffix, FQDN helpers
    ├── deployment.yaml
    ├── hpa.yaml
    ├── ingress.yaml
    ├── service.yaml
    ├── serviceaccount.yaml
    └── tests/
        └── test-connection.yaml
```

The `_helpers.tpl` in every chart defines:

- `<chart>.fullname` — `{release}-{nameOverride|chartName}{stageSuffix}`
- `<chart>.stageSuffix` — returns `-{stage}` or `""` depending on `global.stage.name`
- FQDN helpers for frequently-referenced in-cluster endpoints (Temporal, Qdrant,
  CNPG pooler, DMS, Docling) — these are defined at the chart level to avoid
  hard-coding addresses in `env` values

External charts under `sources/external/` are thin wrappers that pin
upstream chart versions, add project-specific defaults, and expose only the
subset of values needed for this deployment. The full upstream value space
remains accessible by passing through nested keys under the upstream chart name.

---

## Resource Count Summary (full-stack, release name `spark`, namespace `spark`)

| Layer                  | Deployments | Services | StatefulSets | Other                                                                                                                                                                        |
| ---------------------- | ----------- | -------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01-basisdienste        | 4           | 7        | 3            | SpiceDBCluster, Cluster (CNPG), 5 ConfigMaps, 4 ServiceAccounts, 3 PodDisruptionBudgets, HPA, ClusterRole, ClusterRoleBinding, Role, RoleBinding, Pod (qdrant upstream test) |
| 02-frontend            | 2           | 2        | —            | —                                                                                                                                                                            |
| 03-service-layer       | 20          | 19       | —            | —                                                                                                                                                                            |
| 04-orchestration-layer | 7           | 8        | —            | 4 ConfigMaps, post-install Job                                                                                                                                               |
| 05-ai-module-layer     | 10          | 5        | —            | —                                                                                                                                                                            |
| **Total**              | **43**      | **41**   | **3**        |                                                                                                                                                                              |

Full manifest count: **112 Kubernetes resources**.
