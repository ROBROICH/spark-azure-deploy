# Temporal–Shared-Library (Temporal Shared Library)

A shared Python library for connecting application code to Temporal workflows, workers, payload storage, context propagation, observability, and workflow tracking.

This package is a client and shared-code library. It is not the Temporal server. The server is deployed separately and this package connects workers and workflow callers to it.

## Core Features

- **Client creation:** Creates Temporal clients with Pydantic payload conversion and shared interceptors.
- **Worker startup:** Starts Temporal workers with logging, context propagation, tracking, and payload storage support.
- **Workflow helpers:** Provides `start_workflow(...)`, `execute_workflow(...)`, and `stop_workflow(...)` wrappers for application callers.
- **Large payload storage:** Offloads payloads larger than 100 KB to S3-compatible object storage.
- **Observability setup:** Configures OpenTelemetry tracing, log export for local runs, and optional auto-tracing.
- **Shared workflow definitions:** Exposes reusable workflow entry points and typed workflow contracts used by multiple services.

## Architecture

### Overview

The library wraps the Temporal SDK behind a smaller project-level API. Worker services import `start_temporal_worker(...)`; caller services import `create_temporal_client(...)` and workflow helper functions. Both sides can share the same payload converter, S3 payload codec, context interceptor, and tracking behavior.

Shared workflow definitions live in this package so callers and workers import the same typed contracts and stable workflow entry points. That keeps workflow names, input types, project context, and helper wrappers in one place instead of duplicating workflow wiring across services.

### Components

- **`worker.py`:** Client creation, singleton client access, and worker startup.
- **`utils.py`:** Workflow execution helpers used by callers.
- **`payload_codec.py` and `s3_payload_storage.py`:** S3-compatible payload offloading for large Temporal payloads.
- **`observability.py`:** OpenTelemetry setup and tracing helpers.
- **`interceptors/`:** Context, logging, and workflow tracking interceptors.
- **`activities/`:** Shared reusable activities and activity-facing helpers.
- **`workflows/`:** Shared workflow definitions and workflow input/output types.

### Dependencies

| Module / Service | Purpose |
|------------------|---------|
| Temporal server | Runs workflows and schedules activities. |
| S3-compatible object storage | Stores large payloads referenced from Temporal payload metadata. |
| **Event-Logging-Library** | Emits structured worker and workflow logs. |
| **Audit-Client-Library** | Propagates actor and audit context across Temporal boundaries. |
| OpenTelemetry collector | Receives tracing and local log export data. |

### Data Models

- **`Base64Bytes`:** Custom type for base64-encoded byte payloads.
- **`ProjectContext`:** Project identifier and version context propagated through workflows.
- **Workflow input/output models:** Shared Pydantic models under `temporal.workflows.*`.
- **`StatusPayload`:** Workflow tracking payload posted to the workflow tracking service.

## Project Structure

```
src/temporal/
├── __init__.py              # Public API exports
├── worker.py                # Client creation and worker startup
├── utils.py                 # Workflow execution helpers
├── types.py                 # Shared scalar types
├── payload_codec.py         # S3 payload offloading codec
├── s3_payload_storage.py    # S3-compatible storage backend
├── observability.py         # OpenTelemetry setup and tracing helpers
├── CustomOtelPlugin.py      # Temporal OpenTelemetry plugin
├── auto_trace.py            # Import-time auto-tracing support
├── interceptors/            # Context, logging, and tracking interceptors
├── activities/              # Shared reusable activities
└── workflows/               # Shared workflow definitions and types
```

## Getting Started

### Prerequisites

- Python `>=3.13, <3.14`
- `uv` package manager
- Reachable Temporal server
- S3-compatible object storage when payload offloading is enabled
- OpenTelemetry collector when tracing is enabled

### Installation

Add the package to the consuming service:

```toml
[tool.uv.sources]
temporal = { workspace = true }
```

Then add `temporal` to the service dependencies.

### Environment Variables

The library accepts configuration as function arguments, but consuming services commonly map these environment variables into their settings.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TEMPORAL_HOST` | Temporal frontend address passed to client and worker setup. | - | yes |
| `TEMPORAL_TASK_QUEUE` | Task queue polled by the worker or targeted by callers. | - | yes |
| `TEMPORAL_S3_BUCKET_NAME` | Bucket for payload offloading. | - | yes, when storage is used |
| `TEMPORAL_S3_ENDPOINT_URL` | S3-compatible endpoint URL. | - | yes, when storage is used |
| `TEMPORAL_S3_ACCESS_KEY_ID` | S3 access key. | - | yes, when storage is used |
| `TEMPORAL_S3_SECRET_ACCESS_KEY` | S3 secret key. | - | yes, when storage is used |
| `TEMPORAL_S3_REGION` | S3 region. | - | yes, when storage is used |
| `OTEL_SERVICE_NAME` | Service name used in OpenTelemetry resources. | - | yes, when observability is configured |
| `OTEL_ENDPOINT` | OTLP endpoint for traces and local log export. | - | yes, when observability is configured |
| `TEMPORAL_JOB_SERVICE_URL` | Enables workflow tracking when set. Status payloads are posted to this base URL. | unset | no |

### Running the Module / Service

#### In Development

1. Add `temporal` as a workspace dependency to the consuming service.

2. Start or connect to a Temporal server and S3-compatible object storage.

3. Call `setup_observability(...)` as early as possible in the worker entry point before creating the worker. This matters because full tracing mode patches import behavior for auto-tracing.

4. Create an `S3PayloadStorage` and pass it to `start_temporal_worker(...)`.

5. Use `create_temporal_client(...)` and the workflow helper functions from caller services.

#### In Production

1. Package the consuming service with `temporal` as a dependency.

2. Provide Temporal, S3, and observability settings through the service configuration.

3. Set `TEMPORAL_JOB_SERVICE_URL` only for workers or callers that should record top-level workflow lifecycle state.

4. Run workers as normal service processes. The Temporal server and supporting infrastructure remain separate deployments.

## Usage

### Configure Observability Early

Place observability setup near the top of the worker entry point, before worker creation and before imports that should be auto-traced where possible:

```python
from temporal.observability import ObservabilityConfig, setup_observability

setup_observability(
    ObservabilityConfig(
        service_name=ENV.OTEL_SERVICE_NAME,
        otel_endpoint=ENV.OTEL_ENDPOINT,
    )
)
```

### Start a Worker

```python
from temporal.s3_payload_storage import S3PayloadStorage
from temporal.worker import start_temporal_worker

storage = S3PayloadStorage(
    bucket_name=ENV.TEMPORAL_S3_BUCKET_NAME,
    endpoint_url=ENV.TEMPORAL_S3_ENDPOINT_URL,
    access_key=ENV.TEMPORAL_S3_ACCESS_KEY_ID,
    secret_key=ENV.TEMPORAL_S3_SECRET_ACCESS_KEY,
    region=ENV.TEMPORAL_S3_REGION,
)

await start_temporal_worker(
    host=ENV.TEMPORAL_HOST,
    workflows=workflows,
    activities=activities,
    task_queue=ENV.TEMPORAL_TASK_QUEUE,
    storage=storage,
)
```

### Start or Execute Workflows

```python
from temporal import create_temporal_client, execute_workflow, start_workflow

client = await create_temporal_client(
    host=ENV.TEMPORAL_HOST,
    storage=storage,
)

result = await execute_workflow(
    client,
    "my_workflow",
    input_data,
    task_queue=ENV.TEMPORAL_TASK_QUEUE,
)

handle = await start_workflow(
    client,
    "my_workflow",
    input_data,
    task_queue=ENV.TEMPORAL_TASK_QUEUE,
)
```

### Workflow Tracking

When `TEMPORAL_JOB_SERVICE_URL` is set, client and worker interceptors record lifecycle state for top-level workflows. Child workflows are skipped to avoid duplicate top-level rows.

The client interceptor posts a `pending` status after a top-level workflow is started. The worker interceptor posts `running` when the workflow begins and then posts `completed`, `failed`, or `cancelled` when the workflow exits.

Tracking requests are sent to:

```text
POST {TEMPORAL_JOB_SERVICE_URL}/internal/workflows/status
```

Tracking HTTP failures are logged and do not crash workflow execution.

## Public API

| Group | Exports | Purpose |
|-------|---------|---------|
| Client and worker setup | `create_temporal_client`, `get_temporal_client`, `start_temporal_worker` | Connect callers and workers to Temporal. |
| Workflow helpers | `execute_workflow`, `start_workflow`, `stop_workflow`, `WorkflowName` | Start, execute, and cancel workflows. |
| Project context | `ProjectContext`, `project_context`, `use_project_context`, `current_project_context`, `project_scoped_workflow_id` | Carry project identity through workflows and search attributes. |
| Payload and utility types | `Base64Bytes`, `is_in_workflow`, `sliding_window` | Shared helper types and runtime utilities. |
| Observability | `ObservabilityConfig`, `TracingMode`, `setup_observability`, `shutdown_observability`, `traced` | Configure tracing and mark functions for spans. Import these from `temporal.observability`. |

## Testing

Run the package tests from the repository root:

```bash
uv run --package temporal pytest 04-shared-services/temporal/src/temporal/tests
```

Run interceptor tests when changing context propagation or workflow tracking:

```bash
uv run --package temporal pytest 04-shared-services/temporal/src/temporal/interceptors/tests
```
