# Dienst Fachplanungsportal-Integration (FPP Integration Service)

Receives procedures from the specialist planning portal (Fachplanungsportal, FPP). For each one, it creates a SPARK project from the portal's XML and starts downloading the source files.

## Core Features

- The portal sends a project name, its internal project number, the project XML, and the list of source files. SPARK creates the project with the configured default project type. It takes the entry date, the federal state, and the applicant's address and contact data from the XML.
- Every file URL must point to an allowed host. The feature rejects private and reserved network addresses before it opens any connection.
- If an import fails, sending it again finishes the missing steps. It never creates a second project.
- Agent Orchestration downloads each file and confirms it here once document management has saved the archive.

## Architecture

### Overview

An import stores one `fpp_request`, and one `fpp_file` per source file. It creates the project through core's `Projects` Resource and starts one download per file through the `FppDownloads` Resource. Both calls run in the same process.

#### Retrying an import

To recover from a failed import, send the unchanged request again. A failed import keeps its request and file IDs, so the retry finishes creating the project or starts the missing downloads.

- If a request ID or internal project number is reused with a different name, XML, business identifier, or file set, the import returns `409`.
- If the project was created but a download could not be started, the import returns `503`. The retry starts the downloads and does not create another project.
- An import with more than one plan archive is stored and returns `409`. Document management compares each ZIP with the full project state, so adding several archives one after the other would not work. These imports wait until it is decided how several archives are combined.

#### Downloads and project versions

Each imported file records the project version it belongs to. Download confirmation needs `projectId`, `projectVersion`, and `dmsFileId`, and the ZIP must belong to that project and version. Confirmation records that the archive was saved, whether or not it is approved yet. Older rows without a version must be fixed by hand. The feature never assigns them to the latest version on its own.

### Dependencies

The [feature manifest](src/manifest.ts) declares what this feature needs from other features and what it provides to them. See [Resource contracts](../../../packages/resource/README.md) for why features talk through Resources.

| Needs | From | Why |
| --- | --- | --- |
| `Projects` | core | Creating the imported procedure |
| `DocumentFiles` | core | Checking that a saved archive belongs to the project version |
| `FppDownloads` | Agent Orchestration | Starting one download per source file |

It provides `FppFiles`, which Agent Orchestration uses to confirm saved downloads.

FPP and Agent Orchestration need each other. This package defines the `FppDownloads` contract, and Agent Orchestration implements it, so the FPP package does not have to import Agent Orchestration.

### API Endpoints

The backend serves these routes under `/api/fpp/v1`. All routes accept only the `service` role.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/external/fpp/projects` | Imports a procedure from the portal |
| `GET` | `/internal/fpp/requests/:id` | Returns an import request |
| `GET` | `/internal/fpp/files/:id` | Lists the files of an import request |
| `POST` | `/internal/fpp/files/:id/confirm-download` | Confirms a saved download |

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the local stack through the [root setup guide](../../../README.md#getting-started). `DEFAULT_PROJECT_TYPE_ID` must name a seeded, active project type.

### Environment Variables

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `DEFAULT_PROJECT_TYPE_ID` | Project type of imported procedures | `00000000-0000-0000-0000-000000000000` locally | yes |
| `SYSTEM_USER_ID` | Creator recorded on imported procedures | `${LOCAL_USER_ID}` from the root `.env` locally | yes |
| `FPP_ALLOWED_DOMAINS` | Comma-separated hosts that file URLs may use | `fpp.url` locally | yes |
| `FPP_BLOCK_PRIVATE_IPS` | Reject private and reserved download addresses | `true` locally | yes |

### Running the Module / Service

The package runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../apps/spark-backend/README.md#running-the-module--service).

## Testing

From this package directory:

```sh
pnpm test
pnpm typecheck
```

The import and download binding tests need a migrated database. They write and remove only their own rows and are skipped without `FPP_MUTATION_DATABASE_URL`:

```sh
FPP_MUTATION_DATABASE_URL=<local test database URL> pnpm test
```
