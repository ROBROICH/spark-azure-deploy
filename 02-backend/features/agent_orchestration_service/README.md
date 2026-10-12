# Dienst Agentenorchestrierung (Agent Orchestration Service)

Starts and runs the AI analyses of a project, from reading the uploaded documents to the risk hints in the decision draft. The analyses call the AI modules and store their results in the features that own the data.

## Core Features

Each analysis is a Temporal workflow. Temporal is the workflow engine that runs long tasks, retries failed steps, and keeps their state.

| What it does | Workflow in the code |
| --- | --- |
| Reads the uploaded documents, assigns each one a document type and topics, compares them with the required documents and the applicant's table of contents, and then looks for contradictions with the explanatory report (Erläuterungsbericht). From project version 2 on, it only processes new or outdated files. | `FVPWorkflow` |
| Splits a legal norm into its parts, such as the conditions it sets and the vague legal terms it uses. The result is cached per norm and reused by every project. | `MVPWorkflow` |
| Searches the planning documents for passages that deal with a norm and stores them as references. The code calls this search and assignment (Suche und Zuordnung, SuZ). | `suche_zuordnung_norm` |
| Assesses each sentence of a norm against the passages found for it. If passages are missing or outdated, it runs the search first. | `bewertung` |
| Splits each submission from the public participation into arguments and sorts them by the project's topics and subtopics. The results go to Objections Management. | `EWMSOrchestratorWorkflow` |
| Runs the risk finder on one chapter of the decision draft and replaces that chapter's risks. | `risikohinweise` |
| Downloads the files of a procedure from the specialist planning portal (Fachplanungsportal, FPP) into the project. | `FPPDownloadWorkflow` |
| Removes personal data from a PDF. | anonymization workflow |

## Architecture

### Overview

The HTTP routes start the workflows. One backend process, the one started with `ACTIVE_FEATURE_WORKER=agent-orchestration`, runs them. It takes work from the Temporal task queue `orchestration`. The workflows hand the AI steps to the Python AI modules, each on its own queue. The steps that read or store data call the other features through Resources, the typed interfaces that features offer each other in the same process. This feature therefore owns no tables.

A workflow ID names one analysis of one project version: `<name>-<projectId>-v<version>`, plus `-<subjectId>` for analyses per norm or per chapter. Starting an ID that Temporal already knows returns `409 WORKFLOW_ALREADY_STARTED`. The frontend relies on this format.

When `FVPWorkflow` fails, the error lists every analysis that did not deliver a result.

#### Anonymization requests

An anonymization request ID belongs to the user who started it. A request without a file reads the existing run and never starts a new one. An unknown request returns `404`. Reusing a request ID with a different PDF returns `409`.

#### FPP downloads

A download takes the source URL, file name, and project version from the stored FPP import, not from the request. One download workflow runs per source file. You can start a failed download again. It reuses an archive that was already saved, and Document Management does not process a saved archive twice.

### Dependencies

The [feature manifest](src/manifest.ts) declares what this feature needs from other features and what it provides to them. See [Resource contracts](../../../packages/resource/README.md) for why features talk through Resources. Agent Orchestration owns no data. Everything it reads and writes belongs to another feature:

| Needs | From | Why |
| --- | --- | --- |
| `Projects`, `ProjectLogicVersioning` | core | Project context, topics, and the norms of each topic |
| `DocumentFiles` | core | The project's files, and saving imported files |
| `FormalCompletenessVersioning` | Formal Completeness | Storing the completeness result and the comparison with the table of contents |
| `PlausibilityNotesVersioning` | Plausibility Notes | Storing contradictions |
| `ExaminationVersioning` | Examination | Norm breakdowns, found passages, and assessments |
| `AdministrativeFileDraftVersioning` | Administrative File Draft | Reading chapters and storing their risks |
| `Objections` | Objections Management | Storing extracted and classified arguments |
| `FppFiles` | FPP | Confirming saved FPP downloads |

It provides `FppDownloads`, which FPP uses to start the downloads after an import. FPP defines that contract and Agent Orchestration implements it, because this package already depends on FPP.

Today all these Resources write to the same PostgreSQL database. A step that stores results in two features can therefore do both in one transaction. That stops working once one of these features moves to another data store, as explained in [Resource contracts](../../../packages/resource/README.md#moving-a-resource-to-another-data-store).

Outside the backend, the workflows need Temporal, the AI modules on their task queues, and the FPP identity provider for FPP downloads.

### API Endpoints

The backend serves these routes under `/api/agent-orchestration/v1/workflows`.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/formale-pruefung` | Starts the formal completeness and plausibility run |
| `POST` | `/mvp` | Starts the norm breakdown |
| `POST` | `/suz/:normId` | Starts search and assignment for one norm |
| `POST` | `/bewertung` | Starts the legal assessment |
| `POST` | `/risikohinweise` | Starts the risk hints for one chapter |
| `POST` | `/fpp-download` | Starts an FPP download |
| `POST` | `/anonymisierung` | Starts or reads an anonymization request |
| `POST` | `/cancel/:workflowId` | Cancels a running workflow |

## Getting Started

### Prerequisites

Set up Bun, pnpm, Temporal, and the AI modules through the [root setup guide](../../../README.md#getting-started).

### Environment Variables

`src/env.ts` reads these settings. Leave the FPP credentials unset unless you use those imports.

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `TEMPORAL_HOST` | Temporal frontend address | `localhost:7233` locally | yes |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `default` locally | yes |
| `FPP_OIDC_TOKEN_URL`, `FPP_CLIENT_ID`, `FPP_CLIENT_SECRET`, `FPP_USERNAME`, `FPP_PASSWORD` | FPP portal credentials. Set all five or none. | unset | no |
| `TEMPORAL_S3_*` | S3 storage for large Temporal payloads. Set all five or none. | local VersityGW | no |
| `TEMPORAL_MAX_CONCURRENT_ACTIVITIES` | Activities the worker runs at once | SDK default | no |
| `TEMPORAL_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND` | Activity rate limit for the task queue | SDK default | no |

### Running the Module / Service

The package runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../apps/spark-backend/README.md#running-the-module--service). To run the workflows, start one backend process with `ACTIVE_FEATURE_WORKER=agent-orchestration`.

## Testing

From this package directory:

```sh
pnpm test
pnpm typecheck
```

Two test files need a local Temporal server and stay skipped without `AOS_TEMPORAL_TEST_ADDRESS`.

The test for the norm search starts a real `suche_zuordnung_norm` execution on the `orchestration` queue and terminates it afterward. The server needs the search attributes `ProjectId` (Keyword) and `ProjectVersion` (Int), and no orchestration worker may run against it:

```sh
AOS_TEMPORAL_TEST_ADDRESS=127.0.0.1:7233 AOS_TEMPORAL_TEST_NAMESPACE=default \
	pnpm test test/assessment-activities.test.ts
```

The anonymization test checks request ownership and recovery with a worker that returns the PDF unchanged. It does not run the real redaction. Start that worker from `packages/temporal/typescript`:

```sh
pnpm exec node -e 'const {Worker}=require("@temporalio/worker"); Worker.create({namespace:"default",taskQueue:"anonymisierung",workflowsPath:require.resolve("../../../02-backend/features/agent_orchestration_service/test/support/anonymization-echo.ts")}).then(worker=>worker.run())'
```

Then run the test from this package directory:

```sh
AOS_TEMPORAL_TEST_ADDRESS=127.0.0.1:7233 pnpm test test/anonymization-temporal.test.ts
```
