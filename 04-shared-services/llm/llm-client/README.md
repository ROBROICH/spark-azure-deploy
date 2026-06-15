# LLM-Client-Library


**LLM-Client-Library** is a shared Temporal worker package that executes text, structured-output, vision, and embedding activities against a LiteLLM-compatible endpoint.

## Core Features

The library is responsible for:
- running Temporal activities for text, structured-output, vision, and embedding requests
- routing activity execution across provider-specific task queues
- connecting worker execution to S3-backed Temporal payload storage
- exporting OpenTelemetry telemetry for the worker process

## Getting Started

### Prerequisites
- `uv` package manager

### Dependencies

The library depends on:
- LiteLLM-compatible model endpoints via `LITELLM_BASE_URL`
- Temporal and the shared `temporal` package for workflow-facing helpers and worker startup
- S3-compatible object storage for Temporal payload storage
- OpenTelemetry for worker telemetry

### Installation

Install the package from the monorepo workspace:

```bash
uv sync --package llm-client
```

### Environment Variables

Configure the worker with environment variables.

| Variable | Description |
| --- | --- |
| `ENV` | Runtime mode; `dev` enables multi-queue configuration from `QUEUES` |
| `LITELLM_BASE_URL` | Base URL of the LiteLLM-compatible endpoint |
| `LITELLM_MASTER_KEY` | API key for the LiteLLM-compatible endpoint |
| `TEMPORAL_HOST` | Temporal frontend address |
| `TEMPORAL_TASK_QUEUE` | Default task queue name |
| `TEMPORAL_S3_BUCKET_NAME` | S3 bucket for Temporal payload storage |
| `TEMPORAL_S3_ENDPOINT_URL` | S3 endpoint URL |
| `TEMPORAL_S3_ACCESS_KEY_ID` | S3 access key |
| `TEMPORAL_S3_SECRET_ACCESS_KEY` | S3 secret key |
| `TEMPORAL_S3_REGION` | S3 region |
| `QUEUES` | Optional per-queue concurrency and rate-limit configuration in development |
| `OTEL_SERVICE_NAME` | OpenTelemetry service name |
| `OTEL_ENDPOINT` | OpenTelemetry collector endpoint |

### Running the Service

Run the Temporal worker locally:

```bash
uv run python -m llm_client.worker
```

The worker starts one or more Temporal workers depending on the queue configuration and polls provider-specific queues (e.g. `llm-custom`).

### Troubleshooting

- If the worker fails on startup, verify that `LITELLM_MASTER_KEY`, `TEMPORAL_HOST`, and the S3 settings are present.
- If activities do not execute, verify the workflow is targeting the correct task queue for the selected model.
- If payload handling fails for large requests, verify the S3 endpoint and credentials are valid.

## Architecture

### Overview

The package contains worker-side activity implementations and a Temporal worker entry point. Workflows should consume the public helper functions from the shared `temporal` package, while this package runs the underlying activities on provider-specific queues and emits OpenTelemetry signals.

### Data Models

- `LlmActivityInput`, `VlmActivityInput`, and `EmbeddingActivityInput` from the shared `temporal` package define the public activity inputs
- `QueueConfig` describes per-queue concurrency and rate limits
- `WorkerSettings` loads worker configuration from environment variables

## API Endpoints

This package does not expose HTTP endpoints.

Its public developer-facing API consists of workflow helper imports from the shared `temporal` package:
- `temporal.activities.llm.llm_invoke`
- `temporal.activities.llm.llm_invoke_structured`
- `temporal.activities.vlm.vlm_invoke`
- `temporal.activities.embedding.embedding_invoke`
- `temporal.activities.models.get_queue_for_model`
