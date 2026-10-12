# Helm Charts

Helm charts for the SPARK Workflow application stack: the umbrella charts
that compose a complete environment, the per-namespace add-ons of an
environment, and the leaf charts they package.

Paths in this and the chart READMEs are relative to this chart tree.

## Chart hierarchy

```
.
├── 00-umbrella/
│   ├── spark-environment        Top-level application umbrella (full stack as one release)
│   ├── agent-services           Service-layer umbrella — AI modules + agent infra
│   ├── backend-services         Service-layer umbrella — backend services
│   ├── frontend-services        Service-layer umbrella — frontend workloads
│   └── spark-platform           One complete environment per release (stack + per-environment add-ons)
├── 01-frontend/                 Frontend leaf charts
├── 02-backend/                  Backend leaf charts
├── 03-infrastructure/           Per-namespace plumbing (environment-config, gateway-routes)
├── 04-shared-services/          Shared leaf charts (law-DB services, llm-client, temporal, unoserver, clamav, …)
└── 05-modulcluster/             AI module leaf charts
```

`spark-environment` composes the three service layers:

```
spark-environment
├── agent-services      (13 charts)
├── backend-services    (spark-backend-pool × 15 pools)
└── frontend-services   (2 charts)
```

`spark-platform` wraps `spark-environment` and adds the per-environment
add-ons (`environment-config`, `gateway-routes`, `landingpage`, `temporal`,
`unoserver`, `clamav`, `modul-risikohinweiser`, `fallvergleichsservice`,
`modul-normenermittlung` and five per-provider `llm-client` instances). See
[`00-umbrella/README.md`](00-umbrella/README.md) for the full subchart listing
and [`00-umbrella/spark-platform/README.md`](00-umbrella/spark-platform/README.md)
for the environment umbrella.

## Installing

### Full stack (generic)

```bash
helm dependency update 00-umbrella/agent-services
helm dependency update 00-umbrella/backend-services
helm dependency update 00-umbrella/frontend-services
helm dependency update 00-umbrella/spark-environment

helm upgrade --install spark 00-umbrella/spark-environment \
  -f 00-umbrella/spark-environment/values.yaml \
  --namespace <release-namespace> \
  --create-namespace
```

Replace the placeholders in `values.yaml` with deployment-specific values
before running the install command.

### One environment with its add-ons

`spark-platform` installs the stack together with the per-environment
add-ons into one namespace. Its `values.yaml` carries only the
environment-independent wiring; write one values file per environment (see
the [spark-platform README](00-umbrella/spark-platform/README.md) for what it
must set) and pass it on top:

```bash
helm dependency update 00-umbrella/spark-platform   # after the four commands above
helm upgrade --install spark 00-umbrella/spark-platform \
  -n <env> --create-namespace \
  -f my-environment-values.yaml
```

The release name `spark` is load-bearing: in-namespace hostnames derive from
it.

### Dependency update order

Leaf charts are packaged as `.tgz` archives inside each umbrella's `charts/`
directory and the archives are committed. Run `helm dependency update` in the
order shown above — sub-umbrellas before `spark-environment`, then
`spark-platform` — whenever a leaf chart's templates or `values.yaml`
changes.

## Values layout

| Location | Files | Purpose |
|---|---|---|
| Leaf chart (`01-frontend/`, `02-backend/`, …) | `values.yaml` | Base workload config: resources, ports, probes, service, baseline `env` |
| `00-umbrella/spark-environment/` | `values.yaml` | Complete configuration reference — all keys documented with placeholders |
| `00-umbrella/spark-platform/` | `values.yaml` | Environment-independent wiring and subchart toggles |
| Your deployment | one values file per environment | One concrete environment each (stage name, endpoints, pins, databases), passed with `-f` |

Per-chart keys live under `agent-services.<chart>`,
`backend-services.<chart>`, or `frontend-services.<chart>` (nested under
`spark-environment` in the `spark-platform` umbrella); environment add-ons
live under their chart name or alias.

Every leaf chart understands the same globals: `global.namespaceOverride`
(collapse the chart into one namespace), `global.serviceAccount.name` (run
every pod as one shared, workload-identity-bound ServiceAccount and suppress
the chart-created ones), `global.env` / `global.extraEnv` (see the umbrella
README for precedence). Container env is emitted sorted by name so renders are
deterministic.

## Service inventory

### Agent services (`labels.type: agent`)

| Chart | Path |
|---|---|
| `modul-anonymisierung` | `05-modulcluster/modul-anonymisierung` |
| `modul-bewertung` | `05-modulcluster/modul-bewertung` |
| `modul-einwendungsmanagement` | `05-modulcluster/modul-einwendungsmanagement` |
| `modul-formale-pruefung` | `05-modulcluster/modul-formale-pruefung` |
| `modul-inhaltsextraktion-sachverhalt` | `05-modulcluster/modul-inhaltsextraktion-sachverhalt` |
| `modul-plausibilitaet-pruefung` | `05-modulcluster/modul-plausibilitaet-pruefung` |
| `modul-rechtsmethodik` | `05-modulcluster/modul-rechtsmethodik` |
| `modul-suche-und-zuordnung` | `05-modulcluster/modul-suche-und-zuordnung` |
| `gesetze-normen-db-service` | `04-shared-services/gesetze-normen-db-service` |
| `gesetzesbegruendung-db-service` | `04-shared-services/gesetzesbegruendung-db-service` |
| `jura-db-service` | `04-shared-services/jura-db-service` |
| `llm-client` | `04-shared-services/llm-client` |
| `rechtsaenderungs-monitoring` | `04-shared-services/rechtsaenderungs-monitoring` |

### Backend services (`labels.type: backend`)

| Chart | Path |
|---|---|
| `spark-backend-pool` (aliased per pool: `administrative-file-draft`, `agent-orchestration-service`, `comment-service`, `document-management-service`, `examination-service`, `feedback-service`, `formal-completeness-check`, `fpp-service`, `identity-management-service`, `objections-management-service`, `plausibility-notes`, `project-logic-service`, `protocol-service`, `supplementary-requests-service`, `temporal-job-service`) | `02-backend/spark-backend-pool` |

### Frontend services (`labels.type: frontend`)

| Chart | Path |
|---|---|
| `frontend` | `01-frontend/frontend` |
| `prototype-demo` | `01-frontend/prototype-demo` |
| `landingpage` | `01-frontend/landingpage` (environment add-on) |

### Environment add-ons and infrastructure

| Chart | Path |
|---|---|
| `environment-config` | `03-infrastructure/environment-config` — KSA, consolidated ExternalSecrets, otel-collector, NetworkPolicies, SpiceDBCluster |
| `gateway-routes` | `03-infrastructure/gateway-routes` — HTTPRoutes + SecurityPolicies against the shared Gateway |
| `temporal` | `04-shared-services/temporal` — wrapper of the upstream Temporal chart |
| `unoserver` | `04-shared-services/unoserver` |
| `clamav` | `04-shared-services/clamav` |
| `redis` | `04-shared-services/redis` |
| `fallvergleichsservice` | `04-shared-services/fallvergleichsservice` |
| `modul-normenermittlung` | `05-modulcluster/modul-normenermittlung` |
| `modul-risikohinweiser` | `05-modulcluster/modul-risikohinweiser` |

## Placeholder reference

Placeholders follow the `<key-name>` convention and must be replaced with
deployment-specific values before installation.

| Placeholder | Description |
|---|---|
| `<container-registry>` | Container image registry host and optional path prefix |
| `<image-tag>` | Image tag or `hash@sha256:<digest>` |
| `<keycloak-base-url>` | Base URL of the Keycloak instance |
| `<auth-audience>` | JWT audience claim expected by services |
| `<auth-mode>` | Authentication enforcement mode |
| `<auth-realm>` | Keycloak realm name |
| `<spicedb-host>` | SpiceDB gRPC endpoint `host:port` |
| `<postgresdb-host>` | PostgreSQL host or connection pooler |
| `<postgresdb-name>` | Database name for a specific service |
| `<postgresdb-port>` | PostgreSQL port (typically `5432`) |
| `<temporal-host>` | Temporal frontend gRPC endpoint |
| `<temporal-s3-secret>` | Secret holding the Temporal payload-store credentials |
| `<otel-endpoint>` | OTLP gRPC endpoint of the collector |
| `<object-storage-url>` | S3-compatible object storage endpoint URL |
| `<object-storage-bucket>` | Bucket name for service-specific storage |
| `<https-endpoint-url>` | Full HTTPS URL for an external service |
| `<gcp-service-account>` | GCP service account for workload identity |
| `<cors-origins>` | Comma-separated allowed CORS origins |
| `<unoserver-host>` | Unoserver HTTP endpoint for document conversion |
| `<llm-model-name>` | LiteLLM model identifier |
| `<temporal-payloads-bucket>` | S3 bucket for Temporal payload storage |
| `<s3-region>` | AWS/S3-compatible region string |
| `<kubernetes-http-service-url>` | In-cluster HTTP URL |
