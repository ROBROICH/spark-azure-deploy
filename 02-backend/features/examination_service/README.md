# Dienst rechtliche Prüfung (Examination Service)

Holds the legal basis of a project and the results of the legal review.

## Core Features

- Reviewers search the law database by law abbreviation (`jurabk`), paragraph, document number, or federal state. They add the norms that apply to a project topic. Adding a norm copies the law, the norm, its paragraphs, and its sentences into the project.
- The AI splits a norm into its legal parts: the individual conditions it sets, vague legal terms, legal consequences, room for discretion, the people it addresses, and references to other norms. Each norm is split once, and every project reuses the result.
- For each sentence of a norm, the feature stores the passages in the planning documents that deal with it, with the document and page numbers. The code calls them Fundstellen.
- For each sentence, the feature also stores the AI assessment (Bewertung) with its chapters and sources. Reviewers can add their own passages, chapters, and sources.

## Architecture

### Overview

Everything except the stored norm breakdowns belongs to one project version. Each version of the project has its own copy of the legal structure, the found passages, and the assessments.

The tables follow the structure of the law: `gesetz` (law), `norm`, `absatz` (paragraph), and `satz` (sentence). The tables for the breakdown sit below the sentence. `fundstelle` links a sentence to a document and its page numbers. `bewertung`, `bewertung_kapitel`, and `bewertung_quelle` hold the assessment.

Agent Orchestration stores the AI results through the `ExaminationVersioning` Resource. Each write replaces the found passages or the assessment of one sentence in one transaction. It first checks that the project version can still be changed. It keeps what reviewers added by hand: their own found passages, and assessments with chapters or sources they wrote.

Before an analysis starts, it reads the sentence, the documents, and the found passages, and it sends their version along with the result. If any of them changed in the meantime, the write fails with `409 PROCESSING_SOURCE_CHANGED`. Start a new analysis from the current state of the project. If Temporal delivers the same result twice, the feature applies it once.

### Dependencies

The [feature manifest](src/manifest.ts) declares what this feature needs from other features and what it provides to them. See [Resource contracts](../../../packages/resource/README.md) for why features talk through Resources.

| Needs | From | Why |
| --- | --- | --- |
| `Projects` | core | Writable project versions and project topics |

It provides `ExaminationVersioning`. Agent Orchestration uses it to read norms, reuse cached breakdowns, and store found passages and assessments. When core creates a new project version, it uses the same Resource to copy the legal basis and the review results into that version.

Norm searches and norm texts come from the Gesetze- und Normendatenbank over HTTP.

### API Endpoints

The backend serves these routes under `/api/examination/v1`. The generated REST routes of the newer v2 API for the examination tables are under `/api/v2/examination`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/legal-basis/norms` | Searches norms in the law database |
| `POST` | `/legal-basis/projects/:projectId/norms?projectVersion=` | Adds norms to a project topic |
| `GET` | `/norm-deconstructions/` | Lists cached norm breakdowns |
| `POST` | `/norm-deconstructions/` | Stores norm breakdowns |

`GET /norm-deconstructions/` returns 50 rows by default. It accepts `limit` from 1 to 200 and `offset`. The `jurabk` and `paragraph` filters match exactly and apply before pagination. `X-Total-Count` gives the filtered total, and `X-Next-Offset` is present when another page exists.

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the local stack through the [root setup guide](../../../README.md#getting-started). Norm searches need the Gesetze- und Normendatenbank.

### Environment Variables

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `LAW_DATABASE_BASE_URL` | Base URL of the Gesetze- und Normendatenbank | `http://localhost:18020` locally | yes |

### Running the Module / Service

The package runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../apps/spark-backend/README.md#running-the-module--service).

## Testing

From this package directory:

```sh
pnpm test
pnpm typecheck
```

The pagination test runs against a real database and a running backend with authentication turned off. Set `EXAMINATION_TEST_DATABASE_URL` to the test database and `EXAMINATION_BASE_URL` to the backend's `/api/examination/v1` prefix. Run it from the repository root, so the package's law database fixture is not preloaded:

```sh
pnpm exec bun test --isolate --dots 02-backend/features/examination_service/test/norm-deconstructions-pagination.test.ts
```
