# Dienst formale Vollständigkeitsprüfung (Formal Completeness Check Service)

Checks whether an application is formally complete. It compares the uploaded documents with the documents the procedure requires and with the applicant's own table of contents.

## Core Features

- Each project type defines which kinds of documents an application needs, grouped in categories. A new project gets a copy of that list, and reviewers can add their own entries.
- The AI matches each uploaded document to one of the required kinds and gives its reasoning and a confidence value. Reviewers confirm or change the match. A required kind without a document is missing, and the authority can request it from the applicant.
- Notes record where the uploaded documents differ from the applicant's table of contents. Reviewers mark each note as resolved.
- If the same AI result arrives twice, the feature stores it once.

## Architecture

### Overview

The feature has three parts. All of them belong to one project version:

- `category` and `document_type` hold the required document types. A type with `origin = 'system'` comes from the configuration of the project type, which the code calls its usecase. A type with `origin = 'custom'` was added by a reviewer.
- `document` holds one row per uploaded file. `aiSuggestedRequiredDocumentTypeId`, `reasoning`, and `confidence` hold the AI result. `humanRequiredDocumentTypeId` holds the reviewer's choice.
- `table_of_content_notes` holds the differences from the table of contents, each with an `isResolved` flag.

`POST /:projectId/required-document-types/initialize` copies the required types from the usecase into the project version. It fails with `PROJECT_TYPE_MISMATCH` if the version belongs to another project type.

Agent Orchestration runs the analysis and hands over each result as a file through the `FormalCompletenessVersioning` Resource. The feature reads the file, adds any new categories and document types, and stores the AI match of each document. A new result never overwrites a reviewer's choice. For each result, the feature stores a receipt with the project, version, kind (`formal` or `toc`), file, and a hash of the file content. When the same result arrives again, the feature finds the receipt and returns the stored outcome.

### Dependencies

The [feature manifest](src/manifest.ts) declares what this feature needs from other features and what it provides to them. See [Resource contracts](../../../packages/resource/README.md) for why features talk through Resources.

| Needs | From | Why |
| --- | --- | --- |
| `Projects` | core | Writable project versions and the project type of a version |
| `Documents` | core | Result files and the names of uploaded documents |
| `Usecases` | core | The required document types of a project type |

It provides `FormalCompletenessVersioning`. Agent Orchestration uses it to store results and to read the assignments before the plausibility check. When core creates a new project version, it uses the same Resource to copy the check into that version.

### API Endpoints

The backend serves these routes under `/api/fcs/v1`. The generated REST routes of the newer v2 API are under `/api/v2/fcs`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/:projectId/template-categories` | Lists the categories of the project's template |
| `GET` | `/:projectId/template-document-types` | Lists the document types of the project's template |
| `GET` | `/:projectId/required-document-types` | Lists the required document types |
| `POST` | `/:projectId/required-document-types/initialize` | Copies the required types from the project type |
| `POST` | `/:projectId/required-document-types` | Adds a custom required type |
| `PATCH`, `DELETE` | `/:projectId/required-document-types/:documentTypeId` | Changes or deletes a required type |
| `GET` | `/:projectId/documents` | Lists the uploaded documents with their assignments |
| `GET` | `/:projectId/document-summary` | Summarizes the assignment state |
| `PATCH` | `/:projectId/documents/:fileId` | Changes the assignment of a document |
| `GET` | `/:projectId` | Returns the formal completeness result |
| `POST` | `/:projectId/results` | Stores a formal completeness result file |
| `GET`, `POST` | `/:projectId/toc-notes` | Lists or adds notes on the table of contents |
| `POST` | `/:projectId/toc-notes/results` | Stores the result file of the table of contents comparison |
| `PATCH` | `/:projectId/toc-notes/:noteId` | Changes a note or marks it resolved |

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the local stack through the [root setup guide](../../../README.md#getting-started).

### Environment Variables

The package reads no variables of its own. The backend supplies the database and authentication settings described in the [backend environment](../../apps/spark-backend/README.md#environment-variables).

### Running the Module / Service

The package runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../apps/spark-backend/README.md#running-the-module--service).

## Testing

From this package directory:

```sh
pnpm test
pnpm typecheck
```
