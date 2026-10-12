# modul-risikohinweiser

AI module — risk-indicator analysis for planning procedures.

A pure **Temporal worker** that evaluates regulatory risk hints (`Risikohinweise`)
for submitted planning documents. No inbound HTTP traffic. Deployed as an
add-on of the `spark-platform` umbrella (outside the `agent-services` layer).

---

## Rendered resources

| Resource | Condition |
|----------|-----------|
| Deployment | always |
| Service | `service.enabled: true` (default) |
| ServiceAccount | `serviceAccount.create: true` (default) |
| HorizontalPodAutoscaler | `autoscaling.enabled: true` |
| Ingress | `ingress.enabled: true` |

---

## Environment variables

Baseline `env` in [values.yaml](values.yaml); endpoints are placeholders that
the environment values must set:

| Variable | Default | Notes |
|----------|---------|-------|
| `LOG_LEVEL` | `INFO` | |
| `LITELLM_BASE_URL` | `<litellm-api-url>` | LiteLLM proxy API base URL; set per environment |
| `LITELLM_MASTER_KEY` | secretKeyRef `litellm-proxy-credentials` | |
| `LITELLM_MODEL` | `<llm-model>` | LiteLLM model identifier; set per environment |
| `OTEL_ENDPOINT` | `<otel-collector-host>` | OTLP gRPC endpoint |
| `OTEL_SERVICE_NAME` | `risikohinweiser` | |
| `TEMPORAL_HOST` | `<temporal-host>` | Temporal frontend gRPC endpoint |
| `TEMPORAL_LLM_MAX_PER_SECOND` | `3` | |
| `TEMPORAL_S3_ACCESS_KEY_ID` | secretKeyRef `temporal-s3-secrets` | |
| `TEMPORAL_S3_BUCKET_NAME` | `<temporal-payloads-bucket>` | Set per environment |
| `TEMPORAL_S3_ENDPOINT_URL` | `<object-storage-url>` | S3-compatible object storage endpoint |
| `TEMPORAL_S3_REGION` | `my-store` | |
| `TEMPORAL_S3_SECRET_ACCESS_KEY` | secretKeyRef `temporal-s3-secrets` | |

---

## Key values

| Value | Default | Description |
|-------|---------|-------------|
| `namespaceOverride` | `''` | Target namespace for all resources. Empty → release namespace (`helm install --namespace`). |
| `image.repository` | `risikohinweiser-module` | Short image name. Override with the full registry path in the deploying umbrella (e.g. `<container-registry>/risikohinweiser-module`). |
| `image.tag` | `latest` | Image tag. Set to a pinned tag in each environment values file. Empty string → `Chart.appVersion`. |
| `image.pullPolicy` | `Always` | Image pull policy. |
| `replicaCount` | `2` | Pod replicas when autoscaling is disabled. |
| `labels.type` | `agent` | Workload category label applied to all pods. |
| `labels.environment` | `''` | Environment label. Populated via `global.labels.environment` when deployed through an umbrella. |
| `podSecurityContext` | `runAsNonRoot: true, runAsUser: 65532` | Pod-level security context. |
| `securityContext` | `allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, drop: [ALL]` | Container security context. |
| `env` | see `values.yaml` | Baseline environment variables. Win over `global.env`/`global.extraEnv`. |
| `extraEnv` | `[]` | Stage-specific overrides. Highest precedence. |

## Environment variable precedence

When deployed via the umbrella, the container environment is assembled from
four sources in order of increasing precedence:

| Priority | Source | Location |
|----------|--------|----------|
| 1 — lowest | `global.env` | Umbrella `values.yaml` |
| 2 | `global.extraEnv` | Umbrella `values.yaml` |
| 3 | `env` | This chart's `values.yaml` |
| 4 — highest | `extraEnv` | Per-chart key in the umbrella `values.yaml` |

---

## Install

Standalone:

```bash
helm upgrade --install modul-risikohinweiser charts/05-modulcluster/modul-risikohinweiser \
  -f charts/05-modulcluster/modul-risikohinweiser/values.yaml \
  --namespace agent-services
```

Via umbrella (preferred), as part of an environment:

```bash
helm upgrade --install spark charts/00-umbrella/spark-platform \
  -f my-environment-values.yaml \
  --namespace <env>
```

Stage-specific override example in the environment values file:

```yaml
modul-risikohinweiser:
  extraEnv:
    - name: LITELLM_MODEL
      value: "<llm-model-name>"
    - name: LITELLM_BASE_URL
      value: "https://litellm.example.com/v1"
    - name: TEMPORAL_S3_BUCKET_NAME
      value: "<temporal-payloads-bucket>"
```

---

## Namespace behaviour

All resources are placed in the namespace set by `namespaceOverride`. When empty
the release namespace is used — the value supplied via `helm install --namespace`.

The namespace must exist in the cluster before installation; this chart does not
create namespace objects.
