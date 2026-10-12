# agent-services

Helm umbrella chart for the SPARK Workflow agent layer — AI processing modules
and the shared infrastructure services they depend on.

## What this chart contains

| Chart | Category | Description |
|---|---|---|
| `modul-anonymisierung` | AI module | Anonymisation of content |
| `modul-bewertung` | AI module | Legal assessment |
| `modul-einwendungsmanagement` | AI module | Objection management |
| `modul-formale-pruefung` | AI module | Formal completeness check |
| `modul-inhaltsextraktion-sachverhalt` | AI module | Content extraction — facts |
| `modul-plausibilitaet-pruefung` | AI module | Plausibility verification |
| `modul-rechtsmethodik` | AI module | Legal methodology |
| `modul-suche-und-zuordnung` | AI module | Semantic search and assignment |
| `gesetze-normen-db-service` | Shared infrastructure | Laws and norms database |
| `gesetzesbegruendung-db-service` | Shared infrastructure | Legislative reasoning database |
| `jura-db-service` | Shared infrastructure | General legal database |
| `llm-client` | Shared infrastructure | LLM gateway client |
| `rechtsaenderungs-monitoring` | Shared infrastructure | Legal amendment monitoring |

## Installing

```bash
helm dependency update
helm upgrade --install agent-services . \
  -f values.yaml \
  --namespace agent-services \
  --create-namespace
```

## Enabling and disabling subcharts

Every subchart is toggled by its `enabled` flag:

```yaml
modul-anonymisierung:
  enabled: false
```

## Namespace behaviour

Every subchart carries a `namespaceOverride` value that defaults to
`agent-services`. Override an individual subchart when needed:

```yaml
llm-client:
  namespaceOverride: llm-infra
```

When `namespaceOverride` is empty, the release namespace is used.
Namespace objects are not created by this chart.

## global values

Keys under `global` are forwarded to every subchart by Helm's subchart
global mechanism.

| Key | Effect |
|---|---|
| `global.stage.name` | Suffix appended to resource names. Leave empty for no suffix. |
| `global.labels.environment` | Value of the `environment` pod label on all workloads. |
| `global.env` | Shared baseline env injected into every container. |
| `global.extraEnv` | Additional shared env merged after `global.env`. |

Stage name and shared environment variables are injected by a parent umbrella
via `global.stage` and `global.env` / `global.extraEnv`. When installed
standalone, set those values directly in your `values.yaml`.

## Environment variables

Container environments are assembled from four sources in order of increasing
precedence:

| Priority | Source | How to set |
|---|---|---|
| 1 — lowest | `global.env` | Umbrella `values.yaml` |
| 2 | `global.extraEnv` | Umbrella `values.yaml` |
| 3 | `<chart>.env` | Leaf chart `values.yaml` |
| 4 — highest | `<chart>.extraEnv` | Per-chart key in the umbrella `values.yaml` |

Chart-specific entries always overwrite global entries of the same name.

## Per-subchart configuration

Any value key supported by a subchart can be set under that subchart's name:

```yaml
llm-client:
  replicaCount: 2
  image:
    tag: "<image-tag>"
  extraEnv:
    - name: LITELLM_MASTER_KEY
      valueFrom:
        secretKeyRef:
          key: LITELLM_MASTER_KEY
          name: litellm-proxy-credentials-llm-custom
```

## Terminology

| Term | Meaning |
|---|---|
| **umbrella chart** | A chart whose role is to bundle and compose other charts as dependencies. This chart renders no resources of its own. |
| **subchart** / **leaf chart** | A chart listed as a dependency that renders actual Kubernetes resources. |
| **release namespace** | The namespace passed via `helm install --namespace`. |
| `namespaceOverride` | Per-subchart value that routes resources to a specific namespace. |
| **global values** | Values under the `global` key, propagated by Helm to every subchart. |
| `env` | Baseline env in a leaf chart's `values.yaml`. Takes precedence over global env. |
| `extraEnv` | Highest-precedence env, set per chart in the install values file. |
| **dependency archive** | `.tgz` in an umbrella's `charts/` produced by `helm dependency update`. Rebuild whenever a subchart changes. |
