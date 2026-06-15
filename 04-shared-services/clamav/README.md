# Antivirenprogramm (ClamAV)

Cluster-internal antivirus scanning service that provides a REST API for malware detection. Built on ClamAV with a Go REST proxy, deployed via Helm and Kustomize, and secured through the Istio service mesh.

## Core Features

- **File scanning**: Accepts files up to 2 GB via REST API and returns whether they are clean or infected.
- **Signature management**: Automatically updates virus signature databases via freshclam.
- **Zero-trust access control**: Restricts access to explicitly authorized service accounts using SPIFFE/mTLS identities.
- **High availability**: Autoscales based on CPU and memory utilization with pod disruption budgets for safe rollouts.

## Getting Started

### Prerequisites

- Kubernetes cluster with [Istio](https://istio.io/) service mesh installed
- `kubectl` configured with cluster access
- `helm` CLI (v3+) installed
- `make` installed
- The target namespace must have `istio-injection=enabled` (configured in `namespace.yaml`)

### Dependencies

| Dependency        | Purpose                                    | Required |
|-------------------|--------------------------------------------|----------|
| Istio service mesh | mTLS encryption, access control, egress filtering | Yes |
| Helm              | Manages the ClamAV-API StatefulSet and Service | Yes |
| Prometheus        | Scrapes `/metrics` endpoint for monitoring | No       |

The service requires outbound HTTPS access to `database.clamav.net` and `current.cvd.clamav.net`
for signature database downloads. All other egress is blocked.

### Installation

The service is deployed in two layers:

1. **Helm chart** — installs the ClamAV-API StatefulSet, Service, and PVC for signature storage.
   Helm values are defined in `values.yaml`.

2. **Kustomize overlays** — apply supplemental resources not covered by the chart:
   Istio security policies, HPA, PDB, and the clamd ConfigMap.

Deploy to an environment:

```bash
cd k8s
make deploy-testing    # or deploy-staging, deploy-production
```

Verify the deployment:

```bash
cd k8s
make status
```

To remove the Kustomize-managed resources:

```bash
cd k8s
make teardown-testing  # or teardown-staging, teardown-production
```

### Environment Variables

#### Helm Values (`values.yaml`)

| Setting                    | Value         | Description                              |
|----------------------------|---------------|------------------------------------------|
| `config.maxSize`           | 2147483648    | Maximum upload size (2 GB)               |
| `config.scanTimeout`       | 600           | Scan timeout in seconds                  |
| `config.enableGrpc`        | false         | gRPC disabled to reduce attack surface   |
| `config.port`              | 6000          | REST API listen port                     |
| `persistence.size`         | 1Gi           | PVC size for signature databases         |
| `persistence.storageClass` | standard-rwo  | Kubernetes storage class                 |
| `resources.requests`       | 1 CPU / 3 Gi  | Minimum resources per pod                |
| `resources.limits`         | 4 CPU / 6 Gi  | Maximum resources per pod                |

#### ClamAV Daemon (`clamd-configmap.yaml`)

| Setting         | Value   | Description                                    |
|-----------------|---------|------------------------------------------------|
| StreamMaxLength | 2048M   | Maximum size for streamed data                 |
| MaxScanSize     | 4096M   | Maximum bytes scanned across all archive layers |
| MaxFileSize     | 2048M   | Maximum single file size                       |
| MaxRecursion    | 16      | Maximum archive nesting depth                  |
| MaxFiles        | 50000   | Maximum files inside an archive                |
| MaxScanTime     | 600000  | Scan timeout in milliseconds                   |
| MaxThreads      | 20      | Concurrent scans (sized for 4 CPU cores)       |

#### Consumer Configuration

Services that call ClamAV typically configure these settings:

| Variable           | Default                                                  | Description            |
|--------------------|----------------------------------------------------------|------------------------|
| `CLAMAV__ENABLED`  | `false`                                                  | Enable/disable scanning |
| `CLAMAV__BASE_URL` | `http://clamav-api.clamav-system.svc.cluster.local:6000` | Service endpoint       |
| `CLAMAV__TIMEOUT_SECONDS` | `600`                                             | Scan timeout           |

#### Autoscaling

| Parameter    | Testing | Staging | Production |
|--------------|---------|---------|------------|
| minReplicas  | 3       | 3       | 3          |
| maxReplicas  | 20      | 10      | 20         |

Scale-up is aggressive (double capacity every 30s) to handle scan bursts.
Scale-down is conservative (10 min stabilization, -1 pod every 2 min) because scans can take several minutes.

### Running the Service

After deployment, the service is available at the cluster-internal endpoint:

```
http://clamav-api.clamav-system.svc.cluster.local:6000
```

There is no external ingress. Only pods within the Istio mesh whose service accounts
are listed in the AuthorizationPolicy can reach the service.

**Smoke test** (testing environment only):

```bash
cd k8s
make test
```

This deploys a temporary pod, runs a health check, scans the EICAR test file, scans a clean file,
and then removes the pod.

### Troubleshooting

**Pod not starting / CrashLoopBackOff:**
Check if the PVC for signature storage was provisioned and if freshclam can reach `database.clamav.net` on port 443.

**502 responses from the API:**
The clamd daemon is not yet ready. It takes 1-2 minutes to load signature databases on startup.
Wait for the readiness probe to pass before sending scan requests.

**Consumer receives 403 / connection refused:**
The calling service account is not listed in the AuthorizationPolicy.
See [Onboarding a New Consumer](#onboarding-a-new-consumer) below.

**Scan timeouts (504):**
The file exceeds the scan time budget (600s). Consider splitting very large archives
before scanning, or increase `config.scanTimeout` in `values.yaml` and `MaxScanTime` in `clamd-configmap.yaml`.

## Architecture

The service is a cluster-internal scanning endpoint backed by ClamAV. It exposes a REST API through a Go proxy (DevHatRo/ClamAV-API), stores virus signatures on persistent storage, and enforces mTLS-based access control via Istio service mesh.

The service runs as a StatefulSet inside the `clamav-system` namespace, managed by Helm.
Supplemental Kubernetes resources (Istio policies, HPA, PDB, ConfigMap) are managed by Kustomize.

```
clamav-system namespace (Istio mesh)
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ClamAV-API Pod (StatefulSet)                        │  │
│  │                                                      │  │
│  │  ┌──────────────┐  ┌────────┐  ┌──────────────────┐ │  │
│  │  │ Go REST API  │  │ clamd  │  │ freshclam        │ │  │
│  │  │ :6000        │──│ :3310  │  │ auto-updates     │ │  │
│  │  │ /api/scan    │  │ engine │  │ signatures       │ │  │
│  │  │ /stream-scan │  │        │  │                  │ │  │
│  │  └──────────────┘  └────────┘  └──────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│         ▲                                                  │
│         │ ClusterIP :6000 (mTLS via Istio sidecar)         │
│                                                            │
│  Security layers:                                          │
│    PeerAuthentication  → STRICT mTLS                       │
│    AuthorizationPolicy → deny-all + SPIFFE allowlist       │
│    Sidecar             → REGISTRY_ONLY egress              │
│    ServiceEntry        → freshclam HTTPS only              │
│                                                            │
│  Reliability:                                              │
│    HPA  → 3–20 replicas (CPU 50%, memory 70%)              │
│    PDB  → maxUnavailable=1                                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
          │
┌─────────┴──────────┐
│  Consumer pods      │
│  (Istio mesh)       │
│                     │
│  Authorized via     │
│  SPIFFE identity    │
└─────────────────────┘
```

Each pod contains three processes:

| Process    | Role                                      |
|------------|-------------------------------------------|
| Go REST API | Accepts HTTP requests, forwards to clamd  |
| clamd       | ClamAV scanning engine (signature-based)  |
| freshclam   | Downloads and applies signature updates   |

### Security Model

- **Identity**: SPIFFE/mTLS — Istio CA issues short-lived X.509 certificates per pod. AuthorizationPolicy checks the caller's SPIFFE ID on every request. Identities are cryptographic and cannot be spoofed.
- **Ingress**: Deny-all baseline. Only explicitly listed service accounts can reach port 6000. Prometheus can scrape `/metrics` and `/api/health-check` (GET only).
- **Egress**: `REGISTRY_ONLY` mode — pods can only reach `database.clamav.net` and `current.cvd.clamav.net` on port 443. All other outbound traffic is dropped.
- **Encryption**: All scan traffic (files in transit) is encrypted via mTLS between consumer and service.

### Zip Bomb Protection

The service implements defense-in-depth against archive-based denial-of-service:

| Layer | Component      | Protection                                       |
|-------|----------------|--------------------------------------------------|
| 1     | REST proxy     | Rejects uploads exceeding 2 GB                   |
| 2     | REST proxy     | Kills scans exceeding 600s                        |
| 3     | clamd.conf     | StreamMaxLength 2048M                             |
| 4     | clamd.conf     | MaxScanSize 4096M (caps total archive extraction) |
| 5     | clamd.conf     | MaxScanTime 600000ms                              |
| 6     | clamd.conf     | MaxRecursion 16, MaxFiles 50000                   |
| 7     | K8s resources  | 6 Gi memory limit — OOM-kill protects the node    |
| 8     | PDB            | maxUnavailable=1 — surviving pods keep serving    |
| 9     | HPA            | Replaces killed pods and scales for load          |

### Data Models

This service is stateless and does not maintain application-level data models. The only
persistent storage is a 1 Gi PVC used by freshclam to store virus signature databases.

## API Endpoints

### `GET /api/health-check`

Returns the health status of the service.

### `GET /api/version`

Returns the ClamAV engine version and signature database version.

### `POST /api/scan`

Scans a file uploaded as multipart form data.

```bash
curl -F "file=@/path/to/file" \
  http://clamav-api.clamav-system.svc.cluster.local:6000/api/scan
```

### `POST /api/stream-scan`

Scans a file sent as a binary stream. Recommended for large files.

```bash
curl -X POST --data-binary "@/path/to/file" \
  -H "Content-Type: application/octet-stream" \
  http://clamav-api.clamav-system.svc.cluster.local:6000/api/stream-scan
```

### `GET /metrics`

Prometheus-compatible metrics endpoint.

### Response Codes

| Code | Body                                         | Meaning                  |
|------|----------------------------------------------|--------------------------|
| 200  | `{"status": "OK"}`                           | File is clean            |
| 406  | `{"status": "FOUND", "message": "<threat>"}` | Virus/malware detected   |
| 502  | —                                            | ClamAV daemon unavailable |
| 504  | —                                            | Scan timeout exceeded    |

## Onboarding a New Consumer

Access is controlled by Istio AuthorizationPolicy using SPIFFE identities.
To authorize a new service:

1. Identify the service account of the consumer:

   ```bash
   kubectl get serviceaccount -n <namespace>
   ```

2. Add the SPIFFE principal to `k8s/base/istio-authorization-policy.yaml` under the `allow-scan-clients` policy:

   ```yaml
   principals:
     - "cluster.local/ns/<namespace>/sa/<service-account>"
   ```

3. Apply the change:

   ```bash
   kubectl apply -f k8s/base/istio-authorization-policy.yaml
   ```

No changes are needed on the consumer side — mTLS is transparent through the Istio sidecar.
