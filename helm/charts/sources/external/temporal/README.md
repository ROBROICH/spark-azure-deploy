# temporal

Helm wrapper chart for the Temporal workflow engine.

Thin project wrapper around the official [`temporalio/temporal`](https://go.temporal.io/helm-charts)
Helm chart (version 0.73.2, appVersion 1.30.2). Deploys the Temporal server,
web UI, and admin tools against an external PostgreSQL cluster, and adds a
post-install job that registers project-specific custom search attributes.

## What this chart creates

| Source | Resources | Notes |
|---|---|---|
| Upstream `temporalio/temporal` | Server (history, frontend, matching, worker), web UI, admin tools Deployments, Services, ConfigMaps | Configured to use an external PostgreSQL backend |
| `templates/search-attributes-job.yaml` | `batch/v1` `Job` (post-install/upgrade hook) | Registers `ProjectId` (Keyword) and `ProjectVersion` (Int) search attributes into the `default` Temporal namespace |

## Namespace

Temporal resources use the **release namespace** (`helm install --namespace`).
No `namespaceOverride` is set — install into whichever namespace the rest of
the service layer uses.

```bash
helm upgrade --install temporal . \
  -f values.yaml \
  --namespace <release-namespace>
```

## Pre-installation requirements

| Requirement | Notes |
|---|---|
| Release namespace | Must exist before installation or be created with `--create-namespace` |
| PostgreSQL `temporal` database | Schema must be initialised externally (schema jobs are disabled in this chart) |
| PostgreSQL `temporal_visibility` database | Same — schema initialised externally |
| DB password Secrets | One Secret per store (`default` and `visibility`), referenced by `existingSecret` |

Schema management is intentionally disabled (`schema.setup.enabled: false`,
`schema.update.enabled: false`). Run schema setup and migration Jobs from the
Temporal admin tools image before deploying the server.

## Accessing the Temporal frontend

The frontend gRPC service name is derived from the Helm release name and
namespace:

```
{release-name}-temporal-frontend.{release-namespace}.svc.cluster.local:7233
```

Service charts in the same release reference this address via a `tpl` expression:

```yaml
- name: TEMPORAL_HOST
  value: '{{ printf "%s-temporal-frontend.%s.svc.cluster.local:7233" .Release.Name .Release.Namespace }}'
```

## Search attributes post-install Job

A `batch/v1` Job runs as a Helm post-install/post-upgrade hook. It:
1. Polls until the Temporal frontend reports `SERVING`.
2. Waits until the `default` namespace is reachable.
3. Registers `ProjectId` (type `Keyword`) and `ProjectVersion` (type `Int`) if
   they do not already exist.
4. The Job is deleted on success (`hook-delete-policy: hook-succeeded`).

The Job derives the frontend address automatically from the release name and
namespace. Override with `searchAttributesJob.temporalAddress` only when the
Job runs in a different namespace than the server.

Control the Job with `searchAttributesJob.enabled` (default: `true`).

## Configuration

All keys under `temporal:` are forwarded verbatim to the upstream chart.
Full upstream values reference:
<https://github.com/temporalio/helm-charts/blob/main/charts/temporal/values.yaml>

### Key values

| Key | Default | Description |
|---|---|---|
| `namespaceOverride` | `""` | Use the release namespace; set only to force all resources into another namespace |
| `searchAttributesJob.enabled` | `true` | Run the search-attribute registration Job on install/upgrade |
| `searchAttributesJob.image.repository` | `temporalio/admin-tools` | Image for the registration Job (must include the `temporal` CLI) |
| `searchAttributesJob.temporalAddress` | `""` | Empty auto-derives the release frontend address; set only when the Job runs separately from the server |
| `temporal.server.config.numHistoryShards` | `512` | **Immutable after first deploy.** Must match the value used during schema setup. |
| `temporal.server.config.persistence.default.sql.host` | `<db-host>` | PostgreSQL host for the primary store |
| `temporal.server.config.persistence.default.sql.existingSecret` | `<db-secret>` | Secret name holding the DB password |
| `temporal.server.config.persistence.visibility.sql.host` | `<db-host>` | PostgreSQL host for the visibility store |
| `temporal.server.history.replicaCount` | `2` | History service replicas |
| `temporal.web.enabled` | `true` | Deploy the Temporal web UI |
| `temporal.schema.setup.enabled` | `false` | Schema setup Job (disabled — managed externally) |

### Disabled bundled infrastructure

The following upstream subcharts are disabled because the project uses external
services:

| Subchart | Disabled reason |
|---|---|
| `cassandra` | Using PostgreSQL |
| `mysql` | Using PostgreSQL |
| `postgresql` | External CNPG PostgreSQL cluster |
| `elasticsearch` | Visibility uses PostgreSQL |
| `prometheus` | Cluster-level monitoring stack |
| `grafana` | Cluster-level monitoring stack |

## Placeholder reference

| Placeholder | Description |
|---|---|
| `<container-registry>` | Container image registry host and path prefix |
| `<image-tag>` | Image tag or `@sha256:<digest>` |
| `<db-host>` | PostgreSQL host or CNPG pooler FQDN |
| `<db-user>` | PostgreSQL login role name |
| `<db-secret>` | Kubernetes Secret name holding the DB password |
| `<temporal-cors-origin>` | CORS origin allowed for the Temporal web UI (e.g. `https://temporal.example.com`) |
