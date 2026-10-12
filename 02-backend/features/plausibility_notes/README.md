# Dienst Plausibilitätsprüfung (Plausibility Notes Service)

Stores the contradictions the AI finds in the application documents, both within a single document and between a document and the explanatory report (Erläuterungsbericht). Reviewers work through them as plausibility notes.

## Core Features

- Each note describes one contradiction with a title, a description, a rating from 0 to 100, confidence scores, and evidence. When the AI merges similar findings into one note, `mergedCount` says how many it merged.
- Each note lists where the contradiction appears, with the document, the page, and the quoted text.
- Reviewers set a note to `RESOLVED` or `IGNORED`, edit it, or delete it. The AI result sets the first status.
- A new AI result replaces all notes of its project version.

## Architecture

### Overview

`plausibility_note` holds the contradictions, and `plausibility_note_occurrence` holds where each one appears. Both belong to one project version.

Agent Orchestration runs the plausibility check and hands over the result as a file through the `PlausibilityNotesVersioning` Resource. The feature reads the file and replaces all notes of that project version in one transaction. Reviewed, edited, and copied notes are replaced too. A new check therefore throws away the review work on the previous result.

For each stored file, the feature keeps a receipt in `plausibility_result_delivery` with a SHA-256 hash of the file content:

- If the same file arrives again, the feature returns the stored outcome without writing. This also holds after a newer project version exists.
- If a different file arrives under the same file ID, the feature returns `409 RESULT_DELIVERY_CONFLICT`. Send the new result under a new file ID.

### Dependencies

The [feature manifest](src/manifest.ts) declares what this feature needs from other features and what it provides to them. See [Resource contracts](../../../packages/resource/README.md) for why features talk through Resources.

| Needs | From | Why |
| --- | --- | --- |
| `Projects` | core | Latest and writable project versions |
| `Documents` | core | Reading the result file |

It provides `PlausibilityNotesVersioning`. Agent Orchestration uses it to store results. When core creates a new project version, it uses the same Resource to copy the notes into that version.

### API Endpoints

The backend serves these routes under `/api/plausibility-notes/v1/plausibility-notes`. The generated REST routes of the newer v2 API are under `/api/v2/plausibility-notes`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/:projectId` | Lists the notes of a project version |
| `POST` | `/:projectId/job-done` | Applies a result file. Service role only. |
| `PATCH` | `/notes/:noteId` | Changes a note or its status |
| `DELETE` | `/notes/:noteId` | Deletes a note |

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the local stack through the [root setup guide](../../../README.md#getting-started).

### Environment Variables

The package reads no variables of its own. The backend supplies the database, storage, and authentication settings described in the [backend environment](../../apps/spark-backend/README.md#environment-variables).

### Running the Module / Service

The package runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../apps/spark-backend/README.md#running-the-module--service).

## Testing

From this package directory:

```sh
pnpm test
pnpm typecheck
```

Set `PLAUSIBILITY_BASE_URL` to a running backend to run the HTTP contract tests. Also set `PLAUSIBILITY_MUTATION_DATABASE_URL` to run the mutation tests against a prepared database.
