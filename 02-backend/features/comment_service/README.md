# Dienst Kommentarverwaltung (Comment Service)

Lets reviewers comment on a project. A project is one planning approval procedure.

## Core Features

- Each comment belongs to one review step: `formalCompletenessCheck`, `plausibilityCheck`, `materialCompletenessCheck`, `legalReview`, or `unsorted`. You can filter the list by step and by the kind of finding.
- A comment can point at the finding it discusses, such as an entry in the table of contents, a required document, a contradiction, or a legal norm. A reviewer who writes a comment without a finding marks it as `manual`.
- Every create, update, and delete also writes an entry to the change history, in the same database transaction. If the comment change is rolled back, its history entry is rolled back too.

## Architecture

### Overview

A comment row stores the project, title, content, process step, and an optional source reference (`sourceType` and `sourceItemId`). The source types are `tableOfContents`, `requiredDocuments`, `contradiction`, `materialLaw`, `materialNorm`, `materialSatz`, `materialFundstelle`, and `manual`. Every referenced type needs an item ID. Only `manual` may leave it empty.

Creating, updating, and deleting need the project's `create`, `update`, and `delete` permissions. The `admin` and `service` roles bypass these checks.

### Dependencies

The feature needs nothing from other features and provides nothing to them. It only works on its own `comments` table.

### API Endpoints

The backend serves these routes under `/api/comment/v1`. The generated REST routes of the newer v2 API are under `/api/v2/comment`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/projects/:projectId/comments` | Lists the project's comments, optionally filtered by `processStep` and `sourceType` |
| `POST` | `/projects/:projectId/comments` | Creates a comment |
| `GET` | `/projects/:projectId/comments/:commentId` | Returns one comment |
| `PATCH` | `/projects/:projectId/comments/:commentId` | Changes title, content, process step, or source reference |
| `DELETE` | `/projects/:projectId/comments/:commentId` | Deletes a comment |

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the workspace through the [root setup guide](../../../README.md#getting-started).

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
