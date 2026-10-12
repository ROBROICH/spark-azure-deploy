# spark-environment

Top-level Helm umbrella chart for the SPARK Workflow application stack.
Composes three service-layer umbrellas into a single release.

## What this chart contains

| Chart | Description |
|---|---|
| `agent-services` | AI processing modules and shared agent infrastructure |
| `backend-services` | Backend application microservices |
| `frontend-services` | Frontend workloads |

Each layer is itself an umbrella chart that bundles the individual service subcharts.

## Values file

| File | Purpose |
|---|---|
| `values.yaml` | Complete configuration reference — all keys documented with placeholders |

Fill in the placeholders in `values.yaml` with deployment-specific values before
installing. Every placeholder follows the `<description>` convention. The
[Placeholder reference](#placeholder-reference) section below lists every
placeholder with its purpose and the service it belongs to.

## Installing

```bash
helm upgrade --install spark . \
  -f values.yaml \
  --namespace <release-namespace> \
  --create-namespace
```

Before installing, run `helm dependency update` — starting with the service-layer
charts, then this chart:

```bash
helm dependency update ../agent-services
helm dependency update ../backend-services
helm dependency update ../frontend-services
helm dependency update .
```

## Enabling and disabling layers

Entire service layers are excluded with `enabled: false`:

```yaml
agent-services:
  enabled: false
```

Individual subcharts within a layer use the same flag:

```yaml
agent-services:
  modul-bewertung:
    enabled: false
```

## global values

`global` keys are forwarded by Helm to every subchart in the dependency tree.
They provide configuration that applies to all workloads without repeating
values per service.

| Key | Effect |
|---|---|
| `global.stage.name` | Suffix appended to generated resource names (e.g. `svc-v1`). Leave empty for no suffix. |
| `global.labels.environment` | Value of the `environment` pod label on all workloads. |
| `global.env` | Shared baseline env injected into every container. Chart-level `env` wins on name collisions. |
| `global.extraEnv` | Additional shared env merged after `global.env`. Chart-level `env` / `extraEnv` wins on name collisions. |

## Environment variable precedence

Every container's environment is assembled from four sources. When the same
variable name appears in more than one source, the **highest-priority source
wins**:

| Priority | Source | Where to set |
|---|---|---|
| 1 — lowest | `global.env` | `values.yaml` |
| 2 | `global.extraEnv` | `values.yaml` |
| 3 | `<chart>.env` | Leaf chart `values.yaml` |
| 4 — highest | `<chart>.extraEnv` | Per-chart key in `values.yaml` |

`global.env` and `global.extraEnv` are additive for variables that no chart
defines explicitly. A chart-level entry always overwrites a global entry of the
same name.

**Example:**

```yaml
global:
  extraEnv:
    - name: LOG_LEVEL
      value: DEBUG       # applies to all charts …

agent-services:
  modul-bewertung:
    extraEnv:
      - name: LOG_LEVEL
        value: INFO      # … overridden for modul-bewertung only
```

## Per-chart configuration

Chart-specific values live under the layer key, keyed by chart name:

```yaml
agent-services:
  modul-bewertung:
    image:
      tag: "2.1.0"
    replicaCount: 3
```

Any key supported by the leaf chart's `values.yaml` can be set this way.

## Namespace behaviour

Each subchart places its workloads in the namespace set by its
`namespaceOverride` value. Defaults are declared in the service-layer charts:

| Layer | Default namespace |
|---|---|
| `agent-services` | `agent-services` |
| `backend-services` | `backend-services` |
| `frontend-services` | `frontend-services` |

Override an individual service when required:

```yaml
agent-services:
  modul-bewertung:
    namespaceOverride: bewertung-dedicated-ns
```

When `namespaceOverride` is empty, workloads use the release namespace
(`helm install --namespace`). Namespace objects are not created by this chart.

## Placeholder reference

Every `<placeholder>` in `values.yaml` must be replaced before installing.
Placeholders are grouped below by type.

### Shared infrastructure

These values are the same for all services that use them.

| Placeholder | Description |
|---|---|
| `<container-registry>` | Container image registry host and path prefix |
| `<image-tag>` | Image tag or `hash@sha256:<digest>`. Always pin to a specific version. |
| `<auth-audience>` | JWT audience claim validated by every service |
| `<auth-mode>` | Authentication enforcement mode (for example `strict`, `optional_verify_dry_run`, or `disabled`) |
| `<auth-realm>` | Keycloak realm name |
| `<keycloak-base-url>` | Keycloak base URL, e.g. `https://auth.example.com` |
| `<spicedb-host>` | SpiceDB gRPC endpoint `host:port` |
| `<temporal-host>` | Temporal frontend gRPC endpoint `host:port` |
| `<temporal-payloads-bucket>` | S3 bucket for Temporal workflow payload storage |
| `<unoserver-host>` | Unoserver HTTP endpoint for document format conversion |
| `<object-storage-url>` | S3-compatible object storage endpoint URL |
| `<llm-model-name>` | LiteLLM model identifier, e.g. `provider/model-name` |
| `<litellm-proxy-url>` | LiteLLM proxy API base URL, e.g. `https://litellm.example.com/v1` |
| `<cors-origins>` | Comma-separated allowed CORS origins |
| `<gcp-service-account>` | GCP service account email for workload identity impersonation |
| `<kubernetes-http-service-url>` | In-cluster HTTP URL, e.g. `http://svc.ns.svc.cluster.local` |
| `<rate-limit>` | Maximum LLM requests per second (numeric string) |
| `<max-complexity>` | Temporal job admission-control budget (numeric string) |
| `<workflow-complexity-json>` | JSON map of workflow type name → complexity weight |
| `<storage-provider>` | Object storage provider name, e.g. `ceph-s3` |
| `<s3-region>` | S3-compatible region string |
| `<s3-external-url>` | Publicly accessible URL for direct S3 downloads |
| `<sentry-dsn-url>` | Sentry DSN for frontend error reporting |
| `<sentry-environment>` | Sentry environment tag, e.g. `production` |
| `<temporal-ui-url>` | Base URL of the Temporal UI service |
| `<otel-endpoint>` | OpenTelemetry collector gRPC endpoint, e.g. `otel-collector.monitoring.svc.cluster.local:4317` |
| `<qdrant-host>` | Qdrant gRPC endpoint `host:port` for vector search |
| `<qdrant-url>` | Qdrant REST base URL for vector search |
| `<gcp-project-id>` | GCP project identifier |
| `<gcp-bucket-team2>` | GCP bucket for PDF extraction data (inhaltsextraktion) |
| `<gcp-bucket-team7>` | GCP bucket for legal reference database data |
| `<temporal-s3-secret>` | Name of the Kubernetes secret holding Temporal S3 credentials |
| `<temporal-payloads-bucket>` | S3 bucket for Temporal workflow payload storage |
| `<chunking-llm-secret>` | Name of the Kubernetes secret holding the LiteLLM master key for chunking |
| `<docling-host>` | Docling service hostname |
| `<docling-keycloak-secret>` | Name of the Kubernetes secret holding Keycloak credentials for Docling |
| `<keycloak-token-url>` | Full token URL for a Keycloak realm, e.g. `https://auth.example.com/realms/master/protocol/openid-connect/token` |
| `<keycloak-client-id>` | Keycloak client ID for service-level authentication |

### Per-service inter-service URL placeholders

Services that call other services within the cluster use unique per-service URL placeholders.

| Placeholder | Target service |
|---|---|
| `<administrative-file-draft-service-url>` | `administrative-file-draft` |
| `<agent-orchestration-service-url>` | `agent-orchestration-service` |
| `<document-management-service-url>` | `document-management-service` |
| `<examination-service-url>` | `examination-service` |
| `<feedback-service-url>` | `feedback-service` |
| `<formal-completeness-check-url>` | `formal-completeness-check` |
| `<fpp-service-url>` | `fpp-service` |
| `<gesetze-normen-service-url>` | `gesetze-normen-db-service` |
| `<inhaltsextraktion-service-url>` | `inhaltsextraktion` (external shared service) |
| `<objections-management-service-url>` | `objections-management-service` |
| `<plausibility-notes-url>` | `plausibility-notes` |
| `<project-logic-service-url>` | `project-logic-service` |
| `<temporal-job-service-url>` | temporal-job-service (temporal-jobs-module) |

### Per-service PostgreSQL placeholders

Each service uses a unique set of placeholders so that replacing one service's
database host does not affect any other service. The format is
`<postgresdb-{host|name|port}-{service-label}>`.

`protocol-service` reads from every other service's database in read-only mode;
it reuses the same per-service placeholders listed here.

| Service | DB host | DB name | DB port |
|---|---|---|---|
| `gesetze-normen-db-service` | `<postgresdb-host-gesetze-normen>` | `<postgresdb-name-gesetze-normen>` | — |
| `gesetzesbegruendung-db-service` | `<postgresdb-host-gesetzesbegruendung>` | `<postgresdb-name-gesetzesbegruendung>` | — |
| `jura-db-service` | `<postgresdb-host-jura>` | `<postgresdb-name-jura>` | — |
| `rechtsaenderungs-monitoring` | `<postgresdb-host-rechtsaenderungs-monitoring>` | `<postgresdb-name-rechtsaenderungs-monitoring>` | — |
| `modul-rechtsmethodik` | `<postgresdb-host-rechtsmethodik>` | `<postgresdb-name-rechtsmethodik>` | — |
| `administrative-file-draft` | `<postgresdb-host-administrative-file-draft>` | `<postgresdb-name-administrative-file-draft>` | `<postgresdb-port-administrative-file-draft>` |
| `agent-orchestration-service` | `<postgresdb-host-agent-orchestration>` | `<postgresdb-name-agent-orchestration>` | `<postgresdb-port-agent-orchestration>` |
| `comment-service` | `<postgresdb-host-comment>` | `<postgresdb-name-comment>` | `<postgresdb-port-comment>` |
| `document-management-service` | `<postgresdb-host-document-management>` | `<postgresdb-name-document-management>` | `<postgresdb-port-document-management>` |
| `examination-service` | `<postgresdb-host-examination>` | `<postgresdb-name-examination>` | `<postgresdb-port-examination>` |
| `feedback-service` | `<postgresdb-host-feedback>` | `<postgresdb-name-feedback>` | `<postgresdb-port-feedback>` |
| `formal-completeness-check` | `<postgresdb-host-formal-completeness>` | `<postgresdb-name-formal-completeness>` | `<postgresdb-port-formal-completeness>` |
| `fpp-service` | `<postgresdb-host-fpp>` | `<postgresdb-name-fpp>` | `<postgresdb-port-fpp>` |
| `identity-management-service` | `<postgresdb-host-identity-management>` | `<postgresdb-name-identity-management>` | `<postgresdb-port-identity-management>` |
| `objections-management-service` | `<postgresdb-host-objections-management>` | `<postgresdb-name-objections-management>` | `<postgresdb-port-objections-management>` |
| `plausibility-notes` | `<postgresdb-host-plausibility-notes>` | `<postgresdb-name-plausibility-notes>` | `<postgresdb-port-plausibility-notes>` |
| `project-logic-service` | `<postgresdb-host-project-logic>` | `<postgresdb-name-project-logic>` | `<postgresdb-port-project-logic>` |
| `supplementary-requests-service` | `<postgresdb-host-supplementary-requests>` | `<postgresdb-name-supplementary-requests>` | `<postgresdb-port-supplementary-requests>` |

### Per-service storage bucket placeholders

| Service | Placeholder | Purpose |
|---|---|---|
| `administrative-file-draft` | `<storage-bucket-administrative-file-draft>` | Document storage |
| `document-management-service` | `<storage-bucket-document-management>` | Primary document storage |
| `document-management-service` | `<storage-bucket-document-management-quarantine>` | Quarantine bucket for virus scanning |
| `formal-completeness-check` | `<storage-bucket-formal-completeness>` | Document storage |
| `plausibility-notes` | `<storage-bucket-plausibility-notes>` | Document storage |

## Terminology

| Term | Meaning |
|---|---|
| **umbrella chart** | A chart whose role is to compose other charts as dependencies. This chart renders no Kubernetes resources of its own. |
| **service layer** | One of the three mid-level umbrella charts bundled here as dependencies. |
| **leaf chart** | A chart that renders actual Kubernetes resources. |
| **install values file** | The `-f values.yaml` file supplied at install time, with all placeholders filled in. |
| **release** | A named Helm installation. All charts in the same install share `Release.Name`. |
| `namespaceOverride` | Per-chart value that routes a chart's resources to a specific namespace. |
| **global values** | Values under the `global` key, propagated by Helm to every subchart. |
| `env` | Baseline env in a leaf chart's `values.yaml`. Takes precedence over global env on name collisions. |
| `extraEnv` | Highest-precedence env, set per chart in the install values file. |
| **dependency archive** | `.tgz` in an umbrella's `charts/` produced by `helm dependency update`. Rebuild whenever a leaf chart changes. |
