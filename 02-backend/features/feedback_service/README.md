# Dienst Feedbackverwaltung (Feedback Management Service)

Stores how reviewers rate the AI results. The ratings show how good the AI analyses are.

## Core Features

- A feedback entry holds a `positive` or `negative` rating, an optional short reason of up to 30 characters, and an optional text of up to 5000 characters. It records the user who gave it and the result it belongs to (`frontendParentIds`).
- Two routes copy feedback into a new project version and remove the copies again if the new version is never completed.

## Architecture

### Overview

Each feedback row belongs to one project version, like the AI result it rates. When core creates a new project version, it copies the data of the other features, but not feedback. These routes can copy feedback instead:

- `POST /:projectId/copy-version` copies the feedback from `sourceVersion` to `targetVersion` and checks the lock token that core issues while it creates the new version. With `dryRun`, it only reports what it would copy.
- `POST /:projectId/undo-version` deletes the copied feedback again. It only works while the new version is not yet the latest version of the project, that is, before core has finished creating it.

Changes and both version routes need the project `update` permission. The `admin` and `service` roles bypass that check.

### Dependencies

The [feature manifest](src/manifest.ts) declares what this feature needs from other features and what it provides to them. See [Resource contracts](../../../packages/resource/README.md) for why features talk through Resources.

| Needs | From | Why |
| --- | --- | --- |
| `Projects` | core | The latest project version and the version lock |

It provides nothing to other features.

### API Endpoints

The backend serves these routes under `/api/feedback/v1`. The generated REST routes of the newer v2 API are under `/api/v2/feedback`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/:projectId/nodes` | Lists the feedback of a project version |
| `POST` | `/:projectId/batch-nodes` | Reads feedback entries by ID |
| `POST` | `/:projectId/update` | Creates, changes, or deletes feedback entries |
| `POST` | `/:projectId/copy-version` | Copies feedback to a new project version |
| `POST` | `/:projectId/undo-version` | Removes the copies of a failed project version |

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
