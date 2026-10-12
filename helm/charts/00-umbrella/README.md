# Umbrella Charts

Helm umbrella charts that compose the SPARK Workflow application stack.
Paths are relative to the chart tree (the parent of this directory).

## Terminology

| Term | Meaning |
|---|---|
| **umbrella chart** | A Helm chart whose primary purpose is to declare other charts as dependencies. It renders no Kubernetes resources of its own. |
| **service layer** | One of the three mid-level umbrella charts (`agent-services`, `backend-services`, `frontend-services`). Each layer groups a related set of workload charts. |
| **leaf chart** / **workload chart** | A chart that renders actual Kubernetes resources (Deployment, Service, …). Leaf charts live under `01-frontend/`, `02-backend/`, `04-shared-services/`, and `05-modulcluster/`. |
| **install values file** | The `-f values.yaml` file supplied at `helm install`. Contains all deployment-specific values: image tags, infrastructure endpoints, and secrets. |
| **release** | A named Helm installation. All charts in the same install share the same `Release.Name`. Resource names are prefixed with the release name. |
| **release namespace** | The Kubernetes namespace passed via `helm install --namespace`. Used as a fallback when `namespaceOverride` is empty. |
| `namespaceOverride` | A per-chart value that pins all resources of that chart to a specific namespace, independent of the release namespace. `global.namespaceOverride` does the same for every chart of a release; a chart-local override still wins. |
| `global.serviceAccount.name` | Name of one shared ServiceAccount every pod of the release runs as (workload identity binding). When set, leaf charts do not create their own ServiceAccounts. |
| **global values** | Values placed under the `global` key. Helm propagates these down the entire dependency tree so every subchart in a release can read them. |
| `env` | A chart-level list of Kubernetes `EnvVar` objects forming the baseline environment for that chart's containers. Takes precedence over `global.env` and `global.extraEnv` on name collisions. |
| `extraEnv` | A chart-level list of additional environment variables with the highest precedence. Set per chart in the install values file to add or override individual variables. |
| **dependency archive** | A `.tgz` file in an umbrella's `charts/` subdirectory produced by `helm dependency update`. Committed; must be regenerated whenever a leaf chart's templates or values change. |

## Environment variable precedence

Every container's environment is assembled from four sources. When the same
variable name appears in more than one source, **the highest-priority source
wins**:

| Priority | Source | Where to set |
|---|---|---|
| 1 — lowest | `global.env` | `spark-environment` values file |
| 2 | `global.extraEnv` | `spark-environment` values file |
| 3 | `<chart>.env` | Leaf chart `values.yaml` |
| 4 — highest | `<chart>.extraEnv` | Per-chart key in the install values file |

`global.env` and `global.extraEnv` are additive for variables that no chart
defines explicitly. A chart-level entry always overwrites a global entry of the
same name. The merged list is emitted sorted by variable name, so a render is
byte-identical for identical inputs.

## Chart tree

```
00-umbrella/spark-platform            (one environment per release)
├── 00-umbrella/spark-environment     (below)
├── 03-infrastructure/environment-config
├── 03-infrastructure/gateway-routes
├── 01-frontend/landingpage
├── 04-shared-services/temporal
├── 04-shared-services/unoserver
├── 04-shared-services/clamav
├── 05-modulcluster/modul-risikohinweiser
├── 04-shared-services/fallvergleichsservice
├── 05-modulcluster/modul-normenermittlung
├── 04-shared-services/llm-client × 5   (aliases llm-client-{vertex,ionos,mistral,nvidia,huggingface})
└── extraObjects                         (environment-specific raw manifests)

00-umbrella/spark-environment
├── 00-umbrella/agent-services
│   ├── 05-modulcluster/modul-anonymisierung
│   ├── 05-modulcluster/modul-bewertung
│   ├── 05-modulcluster/modul-einwendungsmanagement
│   ├── 05-modulcluster/modul-formale-pruefung
│   ├── 05-modulcluster/modul-inhaltsextraktion-sachverhalt
│   ├── 05-modulcluster/modul-plausibilitaet-pruefung
│   ├── 05-modulcluster/modul-rechtsmethodik
│   ├── 05-modulcluster/modul-suche-und-zuordnung
│   ├── 04-shared-services/gesetze-normen-db-service
│   ├── 04-shared-services/gesetzesbegruendung-db-service
│   ├── 04-shared-services/jura-db-service
│   ├── 04-shared-services/llm-client
│   ├── 04-shared-services/rechtsaenderungs-monitoring
│   └── worker aliases (off by default): gesetze-normen-db-worker, gesetzesbegruendung-db-worker,
│       jura-db-worker, rechtsaenderungs-monitoring-worker
├── 00-umbrella/backend-services
│   └── 02-backend/spark-backend-pool × 15   (one alias per pool of the modulith)
└── 00-umbrella/frontend-services
    ├── 01-frontend/frontend
    ├── 01-frontend/prototype-demo
    └── 01-frontend/frontend aliases (off by default): frontend-ewms, handbuch
```
