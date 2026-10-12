# Dienst Nachforderungsverwaltung (Supplementary Request Service)

Collects what the authority must ask the applicant to hand in or correct. Reviewers create such a supplementary request (Nachforderung) from a finding in any review step. Then they choose which requests go into the letter to the applicant.

## Core Features

- A request can point at the finding that caused it, such as a missing required document, a gap in the table of contents, a contradiction, or a legal norm. `GET /sources` lists the findings that already have a request.
- Each request has a title, a reason, a priority of `must` or `should`, and optionally the review step, topic, and document it concerns.
- Reviewers mark the requests for the letter with `includedInLetter`. `GET /letter-items` returns the marked requests in the order they were created.

## Architecture

### Overview

A request stores `processStep` (`formalCompletenessCheck`, `plausibilityCheck`, `materialCompletenessCheck`, or `legalReview`) and an optional source reference (`sourceType` and `sourceItemId`). The source types are the same as for comments: `tableOfContents`, `requiredDocuments`, `contradiction`, `materialLaw`, `materialNorm`, `materialSatz`, `materialFundstelle`, and `manual`.

Requests belong to the project, not to a project version. A referenced topic or document must belong to the same project. Otherwise the write fails with `FOREIGN_REFERENCE`.

Create, update, and delete need the project's `create`, `update`, and `delete` permissions. The `admin` and `service` roles bypass these checks. Each write also adds an entry to the change history in the same transaction, so the protocol shows every change.

### Dependencies

The [feature manifest](src/manifest.ts) declares what this feature needs from other features and what it provides to them. See [Resource contracts](../../../packages/resource/README.md) for why features talk through Resources.

| Needs | From | Why |
| --- | --- | --- |
| `Projects` | core | Checking that a referenced topic belongs to the project |
| `DocumentFiles` | core | Checking that a referenced document belongs to the project |

It provides nothing to other features.

### API Endpoints

The backend serves these routes under `/api/supplementary-requests/v1`, and the routes of the newer v2 API under `/api/v2/supplementary-requests`. Both use the path `/projects/:projectId/supplementary-requests`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/projects/:projectId/supplementary-requests` | Lists the project's requests |
| `POST` | `/projects/:projectId/supplementary-requests` | Creates a request |
| `PATCH` | `/projects/:projectId/supplementary-requests/:requestId` | Changes a request or its letter flag |
| `DELETE` | `/projects/:projectId/supplementary-requests/:requestId` | Deletes a request |
| `GET` | `/projects/:projectId/supplementary-requests/letter-items` | Returns the requests marked for the letter |
| `GET` | `/projects/:projectId/supplementary-requests/sources` | Returns the source references already used |

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
