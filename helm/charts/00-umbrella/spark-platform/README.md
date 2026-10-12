# spark-platform

Umbrella chart for one complete SPARK Workflow environment per helm release:
the `spark-environment` application stack plus the per-environment add-ons
(namespace plumbing, gateway routes, landing page, Temporal, document
conversion, virus scanning, the modules outside the service layers and the
per-provider LLM queue workers).

The same chart serves every kind of environment. [values.yaml](values.yaml)
carries only the environment-independent wiring — the global keys the
subcharts consume and the add-on toggles. Everything environment-specific
(stage name, namespace, endpoints, databases, buckets, image pins, secret
store paths) goes into one values file per environment that you pass on
install.

## Composition

| Dependency | Toggle | Role |
|---|---|---|
| `spark-environment` | `spark-environment.enabled` | Application stack (agent / backend / frontend layers) |
| `environment-config` | `environment-config.enabled` | ServiceAccount, ExternalSecrets (values-driven, secret-store paths under `externalSecrets.pathPrefix`), otel-collector, NetworkPolicies (or the mesh variant), SpiceDBCluster — each switchable |
| `gateway-routes` | `gateway-routes.enabled` | HTTPRoutes + SecurityPolicies against a shared Gateway |
| `landingpage` | `landingpage.enabled` | Static landing page at the dashboard apex |
| `temporal` | `temporal.enabled` | Temporal engine (wrapper of the upstream chart) |
| `unoserver` | `unoserver.enabled` | Document conversion for the backend |
| `clamav` | `clamav.enabled` | Antivirus scanner (upload scanning is fail-closed) |
| `modul-risikohinweiser`, `fallvergleichsservice`, `modul-normenermittlung` | `<name>.enabled` | Modules outside the layers |
| `llm-client` × 5 | `llm-client-<provider>.enabled` | Queue workers for the per-provider `llm-*` task queues (vertex, ionos, mistral, nvidia, huggingface); `spark-environment` runs the `llm-custom` worker |
| `db-init` | `db-init.enabled` | Opt-in database initialization: create / drop / restore dumps, SpiceDB restore — nothing unless asked |
| — | `extraObjects` | Environment-specific manifests no chart models (rendered with `tpl`) |

All toggles default to `true` in `values.yaml`; an environment switches off
what it gets from elsewhere. When disabling `landingpage`, also set
`gateway-routes.landing.enabled=false` (the dashboard route then redirects
the apex to `/app`); when disabling `clamav`, point `CLAMAV_BASE_URL` at
another scanner.

## The release name is load-bearing

Install with release name **`spark`**. Leaf Services render as
`spark-<chart>-<stage>` and the Temporal services as
`spark-temporal-<component>`; every in-namespace hostname in an environment
values file bakes that prefix in.

## Commands

Dependency archives (`charts/*.tgz`) are committed. After any leaf-chart
change, repackage in order (from the chart tree):

```bash
helm dependency update 00-umbrella/agent-services
helm dependency update 00-umbrella/backend-services
helm dependency update 00-umbrella/frontend-services
helm dependency update 00-umbrella/spark-environment
helm dependency update 00-umbrella/spark-platform
```

Render, lint, install (from this directory), with your environment's values
file:

```bash
helm lint . -f my-environment-values.yaml
helm template spark . -n <namespace> -f my-environment-values.yaml
helm upgrade --install spark . -n <namespace> --create-namespace -f my-environment-values.yaml
```

Before upgrading a live release, diff `helm get manifest spark -n <namespace>`
against the template output; the hook Job of the temporal wrapper
(`Release.Revision` in its name) is expected noise.

A GitOps tool such as ArgoCD can deploy an environment the same way: point
the Application at this chart directory with the environment's values file,
release name `spark` and the environment namespace as destination.

## Environment values contract

An environment values file is the complete, concrete configuration of one
environment:

- **No `<placeholder>` tokens** may survive into the render; every chart
  default that is a placeholder must be set in the environment file.
- **Secrets.** Every `secretKeyRef` points at one of the consolidated Secrets
  rendered by `environment-config` from the secret store (see that chart's
  `values.yaml` for the Secrets, their keys and the store paths); each of them
  has a consumer.
- **Hosts.** Keep the external hosts an environment reaches to a known list
  (identity provider, image registry, LLM gateway, error reporting, the
  prompt-injection model, Docling, the FPP portal, object storage and
  monitoring) and review new ones.
- **Explicit policy.** State deliberate deviations (e.g. the LiteLLM endpoint,
  `AUTH_MODE`) once in the file header and make the replica policy explicit
  per service.

Per-environment inputs (everything else can be derived from the stage name):
`global.stage.name`, `global.labels.environment`, `global.namespaceOverride`,
the database server's private IP (written twice: as the database host and,
as `<ip>/32`, as `environment-config.networkPolicy.cloudsqlCidr`),
`environment-config.gcp.serviceAccountEmail`, the `gateway-routes`
domain / listener sections / realm / CORS origin / landing service, the
Temporal database names, user and CORS origin under `temporal.temporal.*`
(the upstream chart does not template its values), the in-namespace
hostnames, bucket names, database names, Qdrant collection prefixes,
`SENTRY_ENVIRONMENT` and `ENV`.

## Prerequisites outside this chart

Provisioned by your infrastructure tooling, for example Terraform, or by hand:

- **Namespace** `<env>` (with the default
  `environment-config.namespace.create=false` the chart does not create it),
  carrying the label your shared Gateway and other cluster-wide services
  select on, e.g. `kubectl label namespace <env> example.com/environment=true`.
- **Gateway** `api-gateway` in `envoy-gateway-system` with a listener pair
  `https-<env>` / `http-<env>` for `*.<env-domain>` and a certificate that
  covers the environment's hosts (see the
  [gateway-routes README](../../03-infrastructure/gateway-routes/README.md)).
- **Secrets**: an External Secrets Operator `ClusterSecretStore` and the
  entries the `environment-config` chart reads — per environment under
  `externalSecrets.pathPrefix` (database, SpiceDB, Keycloak, envoy-gateway
  client, object-storage HMAC key, Temporal archival encryption key) plus the
  shared entries listed in that chart's `values.yaml`.
- **Identity**: a cloud service account bound via Workload Identity to the
  ServiceAccount `<env>/spark-workflow`; its e-mail goes into
  `environment-config.gcp.serviceAccountEmail`.
- **Keycloak**: realm `<env>` with the clients `envoy-gateway` (edge OIDC;
  secret → `envoy-gateway-credentials`) and the backend client
  (→ `keycloak-credentials`), realm roles `user`, `admin` and `infra-admin`
  (the latter gates the Temporal UI when
  `gateway-routes.temporalAuthorization.enabled=true`).
- **Databases**: a PostgreSQL server with one database per DB-owning service,
  owned by one SQL user per environment (or let `db-init` create them).
- **Buckets** for documents, quarantine, Temporal payloads and Temporal
  archival (browser-facing buckets carry the dashboard origin in their CORS
  config).
- **Cluster services**: spicedb-operator (the chart renders a
  `SpiceDBCluster` named `spicedb`), a Prometheus-compatible collector, and a
  Qdrant instance (isolation by the per-environment collection prefixes set in
  the environment values).

## Operational notes

- ClamAV downloads its signature database on the first start of a fresh
  volume; the pod stays not-Ready for minutes.
- The Temporal `numHistoryShards` value is immutable after the first install.
- The Temporal schema Jobs connect to the database directly (no pooler).
- Pods run as the shared `spark-workflow` ServiceAccount, whose image pull
  secret also covers leaf charts whose defaults name per-service pull secrets
  that do not exist in the environment. Environment-wide pull secrets for
  every pod go into `global.imagePullSecrets`.
