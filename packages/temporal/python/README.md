# Temporal library for Python

The AI modules are Python programs that run as Temporal workers. Temporal is the workflow engine that runs long tasks, retries failed steps, and keeps their state. This package is the shared Python code for those workers: it connects them to Temporal, passes the project and the user along, stores large data outside Temporal, reports the status of each run, and sets up tracing and metrics.

The TypeScript backend uses its own [TypeScript package](../typescript/README.md) for the same job. Both sides use the workflow names, queues, and data formats from the [contracts package](../contracts/README.md).

This package is a library. It is not the Temporal server, which runs as a separate deployment.

## Core Features

- `start_temporal_worker` starts a worker, and `get_temporal_client` returns one shared client for code that starts workflows. Both use the same data conversion, interceptors, and S3 storage.
- Every workflow and task knows its project, its project version, and the user who started it. The `ContextInterceptor` passes this information from the start request to every task and sub-workflow. See [the audit client](../../audit-client/README.md) for the user part.
- Any input or result larger than 100 KiB goes to S3-compatible storage, and the Temporal history only keeps a reference to it.
- Each workflow that was started directly, not by another workflow, reports its status to the backend's Temporal Job feature.
- `setup_observability` sets up OpenTelemetry tracing and Temporal metrics.
- Shared tasks (activities) for calls that many modules need: language models, language models with protection against manipulated input (prompt injection), embeddings, vision models, the law databases, and status reports.
- `DmsClient` calls the backend's document API (DMS, the former document management service) to list, download, and upload project files.
- `create_schedule_router` builds a FastAPI router that creates, changes, and pauses a Temporal schedule for one workflow.

## Architecture

### Overview

The package wraps the Temporal SDK behind a smaller API. A module's worker calls `start_temporal_worker`, and code that starts workflows calls `get_temporal_client`. Both share the same converter for Pydantic models, the S3 storage, the `ContextInterceptor`, and the status reports.

`contracts.py` and `registry.py` are generated from the TypeBox definitions in the [contracts package](../contracts/README.md). Do not edit them by hand. Python field names use `snake_case`. At the boundary to TypeScript, the converter writes the `camelCase` names.

#### Status reports

When `TEMPORAL_JOB_SERVICE_URL` is set, the client and the worker report the status of every workflow that was started directly. Sub-workflows do not report, so each run appears only once. The client reports `pending` after it started a workflow. The worker reports `running` when the workflow begins, and `completed`, `failed`, or `cancelled` when it ends.

The reports go to `POST {TEMPORAL_JOB_SERVICE_URL}/internal/workflows/status`. If a report fails, the worker logs the error and the workflow keeps running.

#### Metrics

`setup_observability` turns on Temporal metrics next to tracing and sends both to the collector in `OTEL_ENDPOINT`. Durations are in seconds. Call it before you create the first Temporal client, because the client reuses its setup.

Once a minute, the tracing plugin also reads the worker's queue and reports how long workflows have been running, recent failures and timeouts, and when it last collected. Workflows need no extra code for this. Workflow IDs are never added to the metrics. If a reading fails, the plugin keeps the last values and marks the collection as unhealthy. Prometheus combines the values of all copies of a worker and calculates the runtime limits. Workflow types to leave out belong in the Prometheus exclusion list of your deployment.

### Components

| Module | Purpose |
| --- | --- |
| `worker.py` | The shared client and worker startup |
| `utils.py` | `execute_child_workflow` and helpers to run tasks in parallel |
| `project_context.py` | Project and project version of the current workflow |
| `interceptors/` | Passing the project and user along, and the status reports |
| `payload_codec.py`, `s3_payload_storage.py` | Storing large inputs and results in S3 |
| `observability.py`, `CustomOtelPlugin.py`, `auto_trace.py` | Tracing and metrics |
| `activities/` | Shared tasks for language models, embeddings, vision models, the law databases, and status reports |
| `dms_client.py` | Client for the backend's document API |
| `schedule_router.py` | FastAPI router for one Temporal schedule |
| `tracking_client.py` | Sends the status reports |
| `contracts.py`, `registry.py` | Generated data formats, workflow names, and queues |

### Dependencies

| Service or package | Used for |
| --- | --- |
| Temporal server | Runs the workflows and hands out the tasks |
| S3-compatible storage | Large inputs and results |
| [Audit client](../../audit-client/README.md) | Who started a workflow, passed on to its tasks |
| Event logging (`packages/event-logging`) | Structured logs of workers and workflows |
| OpenTelemetry collector | Traces, metrics, and logs |
| SPARK Workflow backend | Status reports (Temporal Job feature) and project files (document API) |

## Getting Started

### Prerequisites

- Python 3.13 and uv, set up through the [root setup guide](../../../README.md#getting-started).
- A reachable Temporal server.
- S3-compatible storage if large inputs and results are stored there.
- An OpenTelemetry collector if tracing is on.

Add the package to a module through the uv workspace:

```toml
[tool.uv.sources]
temporal = { workspace = true }
```

Then add `temporal` to the module's dependencies.

### Environment Variables

Most settings are passed to the functions as arguments. Modules usually read them from these variables:

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `TEMPORAL_HOST` | Address of the Temporal server | none | yes |
| `TEMPORAL_TASK_QUEUE` | Queue that the worker takes work from | none | yes |
| `TEMPORAL_S3_BUCKET_NAME`, `TEMPORAL_S3_ENDPOINT_URL`, `TEMPORAL_S3_REGION` | S3 storage for large inputs and results | none | when S3 storage is used |
| `TEMPORAL_S3_ACCESS_KEY_ID`, `TEMPORAL_S3_SECRET_ACCESS_KEY` | Credentials for that storage | none | when S3 storage is used |
| `OTEL_SERVICE_NAME` | Service name in traces and metrics | none | when tracing is on |
| `OTEL_ENDPOINT` | Address of the OpenTelemetry collector | none | when tracing is on |
| `TEMPORAL_JOB_SERVICE_URL` | Base URL for status reports. Without it, nothing is reported. | none | no |

### Running the Module / Service

The library runs inside each AI module's worker. A worker's entry point does three things, in this order:

1. Set up tracing and metrics as early as possible, before the imports that should be traced:

   ```python
   from temporal.observability import ObservabilityConfig, setup_observability

   setup_observability(
       ObservabilityConfig(
           service_name=ENV.OTEL_SERVICE_NAME,
           otel_endpoint=ENV.OTEL_ENDPOINT,
       )
   )
   ```

2. Create the S3 storage.
3. Start the worker:

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

To run another module's workflow from inside a workflow, pass its entry from the registry:

```python
from temporal.registry import PLAUSIBILITAET_WORKFLOW
from temporal.utils import execute_child_workflow

result = await execute_child_workflow(PLAUSIBILITAET_WORKFLOW, input_data)
```

Set `TEMPORAL_JOB_SERVICE_URL` only for workers and clients whose workflows should appear in the job status view.

## Testing

From this directory:

```bash
uv run pytest
```
