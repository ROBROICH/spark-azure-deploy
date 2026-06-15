# Dokumentenvorverarbeitung (Document Preprocessing)

Document preprocessing and conversion service based on Docling Serve, with OCR and structured extraction. The deployment separates API and RQ workers so document conversion runs asynchronously and scales independently.

## Core Features

- **Asynchronous document conversion:** Accepts conversion requests through `docling-serve` and executes jobs via RQ workers.
- **Independent API and worker scaling:** Runs API and workers as separate Kubernetes deployments with independent resource settings.
- **CPU and GPU worker profiles:** Supports both CPU workers (`worker-deployment.yaml`) and GPU workers (`worker-deployment-gpu.yaml`).
- **JWT-protected ingress:** Restricts external access through Istio `RequestAuthentication` and `AuthorizationPolicy`.
- **Observability and health checks:** Exposes `/metrics` and `/health` and defines startup, liveness, and readiness probes. Metrics scraping is restricted by source IP range via Istio policy.

## Architecture

### Overview

The service runs in the `docling-rq` namespace and consists of one API deployment (`docling-serve`) and one worker deployment (`docling-serve-rq-workers`). Both use Redis as the RQ backend through a secret-provided connection URL.

External traffic is routed through Istio, authenticated with JWT, and forwarded to the internal service `docling-serve.docling-rq.svc.cluster.local:5001`. Worker pods consume queued jobs and execute document processing with either CPU or GPU resources.

### Components

- **`deployment.yaml`:** API deployment for `docling-serve`.
- **`worker-deployment.yaml`:** CPU worker deployment for RQ jobs.
- **`worker-deployment-gpu.yaml`:** GPU worker deployment for RQ jobs.
- **`service.yaml`:** ClusterIP service for API traffic and Prometheus scraping.
- **`istio-virtualservice.yaml`:** Istio routing from external host to service.
- **`istio-authorizationpolicy.yaml`:** JWT authentication and authorization rules.
- **`externalsecret.yaml`:** Pull secret provisioning for image registry access.
- **`redis-externalsecret.yaml`:** Redis password and RQ URL secret provisioning.
- **`redis/`:** Redis Helm deployment helper and values.

### Dependencies

| Module / Service | Purpose |
|---------|---------|
| **In-Memory-Key-Value-Datenbank (Redis)** | Stores RQ queues and job state for asynchronous processing. |
| **mTLS-Service-Mesh** | Provides ingress routing and policy enforcement through Istio resources. |
| **Secrets- & Schlüsselverwaltung** | Supplies container registry and Redis credentials via External Secrets. |
| Kubernetes cluster | Runs API and worker deployments and manages service discovery. |

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health probe endpoint used by startup/liveness/readiness checks. |
| `GET` | `/metrics` | Prometheus metrics endpoint for service monitoring. |
| `POST` | `/*` | Docling Serve conversion endpoints exposed by the API service. |

## Project Structure

```text
.
|-- README.md
|-- Makefile
|-- deploy.sh
|-- kustomization.yaml
|-- namespace.yaml
|-- deployment.yaml
|-- worker-deployment.yaml
|-- worker-deployment-gpu.yaml
|-- service.yaml
|-- istio-virtualservice.yaml
|-- istio-authorizationpolicy.yaml
|-- externalsecret.yaml
|-- redis-externalsecret.yaml
|-- pdb.yaml
|-- redis/
|   |-- Makefile
|   `-- values-redis.yaml
```

## Getting Started

The instructions below are for local operator workflows against a Kubernetes cluster.

### Prerequisites

- `kubectl` with access to the target cluster.
- `make` for deployment helper targets.
- `helm` for Redis deployment in `redis/`.
- A namespace with Istio sidecar injection enabled (provided by `namespace.yaml`).

### Environment Variables

The service runtime is configured in Kubernetes manifests. The variables below are set on pods and are required for normal operation unless noted otherwise.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DOCLING_SERVE_ENG_KIND` | Processing engine mode. Must be `rq` for queued execution. | `rq` | yes |
| `DOCLING_SERVE_ENG_RQ_REDIS_URL` | Redis connection URL used by API and workers for RQ. | from secret `docling-redis-auth.rq-redis-url` | yes |
| `DOCLING_SERVE_ENG_RQ_RESULTS_TTL` | Time-to-live (seconds) for successful job results. | `7200` | yes |
| `DOCLING_SERVE_ENG_RQ_FAILURE_TTL` | Time-to-live (seconds) for failed job data. | `86400` | yes |
| `DOCLING_SERVE_MAX_DOCUMENT_TIMEOUT` | Maximum document processing timeout in seconds. | `3600` | yes |
| `DOCLING_SERVE_MAX_SYNC_WAIT` | Maximum synchronous wait time in seconds. | `3600` | yes |
| `DOCLING_SERVE_LOAD_MODELS_AT_BOOT` | Controls model preloading during startup. | API: `False`, Worker: `True` | yes |
| `DOCLING_DEVICE` | Inference device selection for workers/API. | CPU profile: `cpu`, GPU profile: `cuda:0` | yes |
| `UVICORN_HOST` | API bind host. | `0.0.0.0` | yes |
| `UVICORN_PORT` | API bind port. | `5001` | yes |
| `UVICORN_TIMEOUT_KEEP_ALIVE` | API keep-alive timeout in seconds. | `1800` | no |

### Running the Module / Service

#### In Development

1. Create namespace, secrets, API deployment, worker deployment, service, and Istio resources:

   ```bash
   make install
   ```

2. Deploy Redis for the RQ backend:

   ```bash
   make -C redis deploy
   ```

3. Verify rollout status:

   ```bash
   kubectl get pods -n docling-rq
   ```

#### In Production

1. Apply the manifests using your deployment process (for example, Kustomize or a CI pipeline):

   ```bash
   kubectl apply -k .
   ```

2. Ensure that Redis is deployed in the same namespace and that `docling-redis-auth` is present before scaling workers.

3. Route traffic through Istio and validate JWT policy configuration.

## Troubleshooting

<details>
<summary>API pods are healthy but jobs are not processed</summary>

Workers may be missing or unable to connect to Redis.

```bash
kubectl get pods -n docling-rq -l app=docling-serve-rq-workers
kubectl describe secret docling-redis-auth -n docling-rq
```

Ensure worker pods are running and `rq-redis-url` is present in the secret.

</details>

<details>
<summary>Requests are rejected at ingress with authorization errors</summary>

Istio enforces JWT validation and `azp=docling-consumer`.

```bash
kubectl get authorizationpolicy,requestauthentication -n docling-rq
```

Verify the token issuer and `azp` claim match `istio-authorizationpolicy.yaml`.

</details>
