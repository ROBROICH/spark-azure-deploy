# Dienst Workflowmanagement (Temporal Job Service)

Shows the status of the AI analyses of a project. It reads the workflows from Temporal, the workflow engine, and keeps its own status record of every run. It also reports how busy the system is and can archive old workflow histories.

## Core Features

- It lists the workflows of a project version and shows one run with its result. It also shows the steps of a run, page by page, as a tree of sub-workflows and single tasks (activities).
- Every worker reports when a run starts, ends, or fails. The feature stores these reports in `workflow_execution`, together with the error code and which parts of the run failed.
- It adds up the running workflows, each weighted by its type, and compares the sum with a configured maximum. The frontend shows the result as the current system load.
- A weekly workflow can move the histories of finished runs into encrypted files in S3.

## Architecture

### Overview

Temporal holds the authoritative state of running workflows. `workflow_execution` adds what Temporal does not store for SPARK: the project and project version of a run, the error details, and the S3 key of the archived history. TypeScript workers send their reports through a function that retries quick failures for up to 2.5 seconds. Python workers send them to `POST /internal/workflows/status`.

#### System load

`GET /temporal/load` counts the running workflows of each type listed in `WORKFLOW_COMPLEXITY` and multiplies each count by its weight. All other types count together with the weight `DEFAULT_WORKFLOW_COMPLEXITY_WEIGHT`. In the response, a `breakdown` entry with `workflowType: null` stands for those other types. The sum is compared with `MAX_SYSTEM_COMPLEXITY`. The request costs one Temporal count per configured type plus one for all other types, no matter how many workflows run. Temporal's counts can lag behind by a few seconds, and the separate counts are not taken at the same instant.

#### History archival

With `ARCHIVAL_ENABLED=true`, `WeeklyArchivalWorkflow` runs on the schedule in `ARCHIVAL_CRON`. It takes finished runs in batches of `ARCHIVAL_BATCH_SIZE`, encrypts each history with the key in `ARCHIVAL_ENCRYPTION_KEY` (a Fernet key), uploads it under `ARCHIVAL_S3_PREFIX`, and stores the file key on the run.

A run is archived only when it has finished and its history ends with the event that matches its final status. If not, the step fails with `ARCHIVE_NOT_READY` before it uploads anything, and a later run of the archive workflow tries again. When a workflow restarted itself with a fresh history (continue-as-new in Temporal), each part is archived on its own.

The backend process started with `ACTIVE_FEATURE_WORKER=temporal-job` runs the archive workflow.

### Reading workflows

These rules matter if you build a job view on these routes.

#### Lists

`pageSize` is 1 to 100, with 100 as default. `nextPageToken` is a token from Temporal for the next page. Pass it back unchanged. A null token ends the list, but an empty page can still have a token. Send the same filters with every page.

Both lists filter by an exact `workflowId`. The list by type also filters by `executionStatus` (default `all`) and by the pair `rootWorkflowId` and `rootRunId`. The pair selects every workflow that the given run started, directly or indirectly, but not the run itself. That run must belong to the requested project and version.

Lists show running workflows first, then the most recently finished and started ones. They never include the steps of a run. To get the status of one known run, filter by its workflow ID.

#### Details

`GET /temporal/workflows/:workflowId` takes an optional `runId` and returns exactly that run. If the workflow restarted itself, the route does not follow to the newer run. With `includeResult=false`, it reads only the run's status data and skips the result and the history.

#### Steps of a run

`GET /temporal/workflows/:workflowId/execution-tree` returns one page of a run's history as a tree. The response has `runId`, `nextPageToken`, `historyComplete`, and `continuedAsNewRunId`. Each child is an update keyed by Temporal's `eventId`:

- A sub-workflow has `children: null` until you load its own tree with its `id` and `runId`.
- An activity has `children: []`.
- The status of an activity can arrive before its name. Merge updates by `eventId` and keep the name and ID you already have.

`historyComplete` means that the history of this run has been read to the end. It does not mean that the sub-workflows are loaded or that a running workflow has finished. Temporal may return more events than `pageSize`, because it never splits a group of events that belong together.

#### Access

Each history page checks access to the exact run. A sub-workflow without its own `ProjectId` takes the project of the run that started it in Temporal. The project ID that the client sends is never used for this.

#### Results

Temporal stores large results in S3. Reading them needs the five `TEMPORAL_S3_*` settings, even when archival is off. Without them, the routes still return status data.

### Dependencies

The feature needs nothing from other features and provides nothing to them. Its `TemporalWorkflows` Resource is the Temporal client for its own routes. Outside the backend, it needs Temporal, and S3 for archival and large payloads.

### API Endpoints

The backend serves these routes under `/api`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/temporal/workflows` | Lists workflows |
| `GET` | `/temporal/workflows/by-type/:projectId` | Lists a project's workflows by type, status, or root run |
| `GET` | `/temporal/workflows/:workflowId` | Returns one run, optionally with its result |
| `GET` | `/temporal/workflows/:workflowId/execution-tree` | Returns one history page of a run as a tree |
| `GET` | `/temporal/load` | Returns the system load |
| `POST` | `/internal/workflows/status` | Stores a status report. Service role only. |

## Getting Started

### Prerequisites

Set up Bun, pnpm, Temporal, and VersityGW through the [root setup guide](../../../README.md#getting-started).

### Environment Variables

`src/env.ts` reads these settings:

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `TEMPORAL_HOST` | Temporal frontend address | `localhost:7233` locally | yes |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `default` locally | yes |
| `TEMPORAL_MAX_CONCURRENT_ACTIVITIES` | Activities the archival worker runs at once | `2` locally | yes |
| `ARCHIVAL_ENABLED` | Turn history archival on | `false` locally | yes |
| `ARCHIVAL_ENCRYPTION_KEY` | Fernet key for archived histories | none | when archival is on |
| `ARCHIVAL_WORKFLOW_ID` | ID of the archival workflow | `WeeklyHistoryArchivalWorkflow` locally | yes |
| `ARCHIVAL_CRON` | Archival schedule | `0 0 * * 0` locally | yes |
| `ARCHIVAL_BATCH_SIZE` | Runs per archival batch | `100` locally | yes |
| `ARCHIVAL_S3_PREFIX` | Object key prefix for archived histories | `temporal-history` locally | yes |
| `DEFAULT_WORKFLOW_COMPLEXITY_WEIGHT` | Load weight of unconfigured workflow types | `3` locally | yes |
| `MAX_SYSTEM_COMPLEXITY` | Load at 100 percent | `20000` locally | yes |
| `WORKFLOW_COMPLEXITY` | JSON object of load weights per workflow type | `{}` locally | yes |
| `TEMPORAL_S3_*` | S3 storage for large payloads and archives. Set all five or none. | local VersityGW | no |

### Running the Module / Service

The package runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../apps/spark-backend/README.md#running-the-module--service). To run archival, start one backend process with `ACTIVE_FEATURE_WORKER=temporal-job`.

## Testing

From this package directory:

```sh
pnpm test
pnpm typecheck
```

The default tests use recorded Temporal fixtures and check the HTTP contracts. Three test files run against a real Temporal server and are skipped unless `TEMPORAL_JOB_TEST_ADDRESS` and `TEMPORAL_JOB_TEST_NAMESPACE` are set. The server needs the search attributes `ProjectId` (Keyword) and `ProjectVersion` (Int), and `SPARK_TEMPORAL_FIXTURE_FILE` must be unset.

The pagination test creates real workflows with children and terminates them afterward:

```sh
TEMPORAL_JOB_TEST_ADDRESS=127.0.0.1:7233 TEMPORAL_JOB_TEST_NAMESPACE=default \
	pnpm test test/workflow-read-budget.test.ts --timeout 120000
```

The archive and result payload tests are `test/*.temporal.test.ts`. The archive test also needs `TEMPORAL_JOB_TYPESCRIPT_DATABASE_URL`.
