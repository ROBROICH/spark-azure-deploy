# spark-temporal TypeScript

`@spark-temporal/typescript` starts and runs every TypeScript worker in SPARK. A worker is the process part that executes Temporal workflows and their single tasks (activities). The package passes the project and the user from the start request on to every task and sub-workflow. It also records the status of each run and stores large AI data outside the Temporal history.

## Core Features

- `startTemporalWorker` takes one options object and returns a handle to wait for the worker or stop it.
- Each workflow knows its project, its project version, and who started it. Its tasks and sub-workflows get the same information, so they write into the right project version and the protocol shows who started the run.
- Each workflow that was started directly, not by another workflow, reports `running`, `completed`, `failed`, or `cancelled`. The Temporal Job feature stores these reports for the job status view.
- Document text and AI results can be large. Any input or result above 100 KiB goes to S3, and the Temporal history only keeps a reference to it.
- Workers send Temporal metrics and the state of their queue to OpenTelemetry. Workflows need no extra code for this.
- `readTemporalFixture` returns recorded results, so HTTP tests run without a Temporal server.

## Architecture

### Overview

#### Starting a worker

The Temporal Job feature starts its worker like this:

```ts
return startTemporalWorker({
	targetHost: configuration.temporalHost,
	namespace: configuration.temporalNamespace,
	taskQueue: TEMPORAL_JOB_TASK_QUEUE,
	maxConcurrentActivities: configuration.maxConcurrentActivities,
	maxTaskQueueActivitiesPerSecond: configuration.maxTaskQueueActivitiesPerSecond,
	workflowBundle,
	activities: archivalActivities(/* ... */),
	payloadCodec,
	reportWorkflowStatus: (request) => updateWorkflowStatus(scope, request),
	ownedResources: [connection, { close: () => ownedArchiveObjects.destroy() }],
})
```

The returned `done` is the SDK's run promise. `close()` asks the worker to stop, waits for `done`, and closes the resources in `ownedResources`. The SDK gives running activities 10 seconds to drain and forces shutdown after 15 seconds. The package installs no process signal handlers. The backend calls `close()` when it shuts down.

#### Context

Every workflow receives the header `spark-temporal-context-v1`. It holds who is acting and who started the action, the workflow run, and the request, as well as the project (`projectId`) and its version (`projectVersion`, a whole number from 1). Hooks in the workflow code (interceptors) pass the header on to every message, task, and sub-workflow. Inside a task, the audit client and the project version checks read their values from it.

#### Status reports

Only workflows that were started directly report their status. A sub-workflow counts as part of the run that started it. When a workflow restarts itself with a fresh history (continue-as-new in Temporal), the old run counts as `completed`. In the backend, the report goes straight to the Temporal Job feature's `workflow_execution` table.

#### Payloads

If S3 is configured, the worker stores every input or result larger than 100 KiB under `payloads/<uuid>` in the configured bucket. The Temporal history only keeps a reference. Reading a result decodes the reference again, so every process that reads results needs the same S3 settings.

#### Metrics

The worker exports Temporal SDK metrics to `OTEL_EXPORTER_OTLP_ENDPOINT` over HTTP/protobuf or gRPC, with durations in seconds. Once a minute, it also reads its task queue over the existing connection and exports how long workflows have been running, recent failures and timeouts, and when it last collected. Workflow IDs are never added to the metrics. Prometheus combines the values of all copies of a worker and applies the alert limits of each deployment.

#### Building workers

The package ships two Vite plugins for `vp pack`. They do different jobs:

- `build-temporal-workflow/vite` (`temporalWorkflow`) bundles workflow code. An import of `./workflows.ts?workflow` becomes a `WorkflowBundle` for `Worker.create`. It does the job of Temporal's `bundleWorkflowCode`, with esbuild instead of Webpack.
- `./runtime-plugin` packs the worker process into a `dist/` without `node_modules`. It replaces the SDK's Webpack bundler with an empty version so a packed worker never bundles code while it runs. It also fixes the path of the worker thread for ES modules and writes `workflow-worker-thread.cjs`.

`workflow.d.ts` types the `?workflow` import.

#### Runtime compatibility

Use Temporal SDK 1.24.0 or later with Bun 1.4. SDK 1.22.0 treats Bun's worker-thread exit code as a failed shutdown. Bun 1.4.0 does not implement `v8.promiseHooks.createHook`, so workflow threads print a plain-text warning that stack trace collection is off. That warning does not go through the structured logs.

## Getting Started

### Prerequisites

Set up Bun, pnpm, and Temporal through the [root setup guide](../../../README.md#getting-started).

### Environment Variables

The package reads no variables itself. Each worker parses these shared settings and passes them as options:

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `TEMPORAL_HOST` | Temporal frontend address | none | yes |
| `TEMPORAL_NAMESPACE` | Workflow namespace | none | yes |
| `TEMPORAL_MAX_CONCURRENT_ACTIVITIES` | Activities the worker runs at once | SDK default | no |
| `TEMPORAL_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND` | Activity rate limit for the task queue | SDK default | no |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_PROTOCOL` | Metrics collector | none | no |
| `SPARK_TEMPORAL_FIXTURE_FILE` | Recorded Temporal results for tests | none | no |

The S3 payload settings belong to each worker's own parser.

### Running the Module / Service

The library runs inside the SPARK Workflow backend. Each backend process starts at most one worker, selected by `ACTIVE_FEATURE_WORKER`. See the [backend README](../../../02-backend/apps/spark-backend/README.md#running-the-module--service).

## Testing

From this directory:

```sh
pnpm test
pnpm typecheck
```
