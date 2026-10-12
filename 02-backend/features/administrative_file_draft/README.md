# Dienst Verwaltungsaktentwurf (Administrative File Draft Service)

Holds the draft of the authority's decision as a tree of chapters. The decision draft is called Verwaltungsaktentwurf (VAE) in the code. The feature also stores the risks the AI finds in each chapter and exports the finished draft as a Word or PDF file.

## Core Features

- Assigning a template copies the chapter structure of the project type into the project. The project type's configuration (its usecase) defines that structure. A chapter that names a topic is linked to the project topic with the same name.
- Each chapter has an assignee. The assignee and the team leader each check the chapter off, and both check marks are stored with a timestamp.
- The AI marks risks in a chapter. A risk has a problem, its consequence, a severity from 1 to 10, and an optional recommendation and quote. New risks are `OPEN`. Reviewers set them to `CORRECTED` or `IGNORED`.
- The export fills the bundled Word template with the visible chapters and the project name and number. unoserver, a document conversion server based on LibreOffice, then turns it into DOCX or PDF.

## Architecture

### Overview

Chapters (`vae_node`) and risks belong to one project version. Their primary key includes `project_version`, so every version of the project has its own copy of the draft. Writes go through `transactVersionWrite`, which fails when the version can no longer be changed. The `vae_node_history` and `risks_history` tables keep the earlier states of each row.

A template is assigned once per project version. If the version already has chapters, the call changes nothing. If a template chapter names a topic that the project does not have, the call fails with `INVALID_TOPIC`. The route is `POST /templates/:templateId/assign-template/:projectTypeId`. Its `templateId` part holds the project ID, not a template ID.

Agent Orchestration writes the AI results. It reads chapters and stores risks through the `AdministrativeFileDraftVersioning` Resource, which is a typed interface this feature offers to other features in the same process. The v1 template and risk routes accept only the `admin` and `service` roles. The export routes need the project `export` permission.

Export reads the latest project version and leaves out hidden and deleted chapters. If no chapter is left, export fails with `EXPORT_NOT_FOUND`. Before each conversion, the export sends unoserver a short test request. If unoserver is down, the export fails after `UNO_PREFLIGHT_TIMEOUT_MS` instead of waiting for the full conversion timeout. Each export writes an entry to the change history.

### Dependencies

The [feature manifest](src/manifest.ts) declares what this feature needs from other features and what it provides to them. See [Resource contracts](../../../packages/resource/README.md) for why features talk through Resources.

| Needs | From | Why |
| --- | --- | --- |
| `Projects` | core | Project versions, topics, and the project name and number for the export |
| `Usecases` | core | The decision structure of the project type |

It provides `AdministrativeFileDraftVersioning`. Agent Orchestration uses it to read chapters and store risks. When core creates a new project version, it uses the same Resource to copy the draft into that version.

Export also needs a running unoserver. The local stack starts it from `04-shared-services/basiskomponenten/unoserver`.

### API Endpoints

The backend serves these routes under `/api/vae/v1`. The generated REST routes of the newer v2 API for `risks` and `vae-nodes` are under `/api/v2/vae`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/templates?projectTypeId=` | Returns the template for a project type |
| `GET` | `/templates/:templateId/nodes` | Returns the template's chapters |
| `POST` | `/templates/:templateId/assign-template/:projectTypeId` | Copies the template chapters into the project |
| `GET` | `/risks/:projectId` | Lists the risks of the latest project version |
| `POST` | `/risks/:projectId` | Stores new risks |
| `PATCH` | `/risks/:riskId` | Changes a risk or its status |
| `POST` | `/:projectId/export/docx` | Exports the draft as DOCX |
| `POST` | `/:projectId/export/pdf` | Exports the draft as PDF |

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the local stack through the [root setup guide](../../../README.md#getting-started). Export needs the `unoserver` container from that stack.

### Environment Variables

`src/env.ts` reads these settings:

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `UNO_HOST` | unoserver host | `localhost` locally | yes |
| `UNO_PORT` | unoserver port | `2003` locally | yes |
| `UNO_PROTOCOL` | `http` or `https` | `http` locally | yes |
| `UNO_TIMEOUT_MS` | Timeout for one conversion | `120000` locally | yes |
| `UNO_PREFLIGHT_TIMEOUT_MS` | Timeout for the reachability check before a conversion | `10000` locally | yes |

### Running the Module / Service

The package runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../apps/spark-backend/README.md#running-the-module--service).

## Testing

From this package directory:

```sh
pnpm test
pnpm typecheck
```
