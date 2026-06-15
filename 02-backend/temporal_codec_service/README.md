# Temporal Codec Service

A small FastAPI server that exposes the Temporal payload codec `/encode` and `/decode` routes, backed by S3-based payload storage.

## Core Features

- **Payload encoding:** Encodes large Temporal payloads for external object storage.
- **Payload decoding:** Decodes stored payload references for Temporal UI inspection.
- **S3-backed storage:** Uploads and retrieves payload data through S3-compatible storage.

## Architecture

### Overview

This service enables viewing workflow inputs and results in the Temporal UI when payloads exceed 100 KB. Large payloads are transparently uploaded to S3 and retrieved whenever a workflow or activity boundary is crossed.

## Getting Started

### Prerequisites

- `uv` package manager
- S3-compatible object storage
- Shared platform services from the [root README](../../README.md#dependencies) when running locally

### Environment Variables

Non-secret configuration lives in `.env.local` (tracked in git). To generate secrets, run once from the repository root:

```bash
scripts/create_secrets.sh
```

This script creates the shared root-level `.env` file used by the local Docker Compose setup.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TEMPORAL_S3_BUCKET_NAME` | S3 bucket for Temporal payloads | — | yes |
| `TEMPORAL_S3_ENDPOINT_URL` | S3 endpoint URL | — | yes |
| `TEMPORAL_S3_ACCESS_KEY_ID` | S3 access key | — | yes |
| `TEMPORAL_S3_SECRET_ACCESS_KEY` | S3 secret key | — | yes |
| `TEMPORAL_S3_REGION` | S3 region | — | yes |
| `HOST` | Uvicorn bind host, read directly from `os.environ` in `main.py` | `0.0.0.0` | no |
| `PORT` | Uvicorn bind port (read directly from `os.environ` in `main.py`) | `8000` | no |

### Running the Service

#### In Development

```bash
uv run main.py
```

#### In Production

This service has no `k8s/` overlay in this repository; it is expected to run as part of the local `process-compose` / Docker Compose stack rather than via a Kubernetes Deployment.
