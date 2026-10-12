# Modul formale Vollständigkeitsprüfung (Module Formal Completeness Check)

The *Modul formale Vollständigkeitsprüfung* automates the Formal Completeness Check to ensure all required documents are present and correctly classified. The check is performed through two complementary tracks:

1. **LLM Document Matching:** Maps uploaded files against a predefined set of required document types to track the existence of documents for each mandatory category.
2. **Inhaltsverzeichnis (TOC) Matching:** Automatically detects, parses, and matches files against the project-specific Table of Contents (TOC) to identify inconsistencies or missing documents.

The goal is to provide users with a clear, automated status of their submission, highlighting exactly where the uploaded files differ from the expected application structure.

## Core Features

### LLM Document Matching

Classifies documents into predefined categories based on semantic content (robust against misleading filenames). Accepts custom document type definitions:

```json
[
   {
      "category": "Category (e.g. Allgemeiner Teil)",
      "document_type_name": "Document Type (e.g. Erläuterungsbericht)",
      "document_type_description": "A very precise description.",
      "expected_count": null
   }
]
```


### Inhaltsverzeichnis (TOC) Finder

Multi-stage pipeline to identify the global Table of Contents (TOC) using textual content, summaries, filenames, and folder structure. Applies hierarchical filtering with strict fail-safes (no TOC match → no document selected). Parses detected TOCs into structured category schemas for downstream matching.

### Inhaltsverzeichnis (TOC) Matching

Combines TOC detection and LLM matching into one workflow: Uses the TOC-derived document descriptions to classify all required documents and validates coverage against the expected submission structure.

## Architecture

### Overview

The **Modul formale Vollständigkeitsprüfung** runs as asynchronous Temporal workflows, triggered by the **Dienst Agentenorchestrierung**.
It requires prior text extraction via the **Modul Inhaltsextraktion**. Results are stored in the **Dienst formale Vollständigkeitsprüfung** for frontend display.

### Workflow Overview

```mermaid
sequenceDiagram
    autonumber
    participant DMS as Dienst Dokumentenmanagementsystem
    participant AOS as Dienst Agentenorchestrierung
    participant Temporal as Temporal Service
    participant ExtractionAgent as Modul Inhaltsextraktion
    participant FVPAgent as Modul formale Vollständigkeitsprüfung
    participant FVPService as Dienst formale Vollständigkeitsprüfung

    Note over DMS,FVPService: Phase 1: Inhaltsextraktion Workflow
    activate AOS
    AOS-->>Temporal: Queue extraction job
    Temporal-->>ExtractionAgent: Process extraction
    activate ExtractionAgent
    DMS->>ExtractionAgent: Return documents via signed URLs
    Note over ExtractionAgent: Processing time ~3-5 hours
    ExtractionAgent->>DMS: Store extracted documents into results folder
    ExtractionAgent-->>Temporal: Extraction completed
    deactivate ExtractionAgent
    Temporal-->>AOS: Extraction workflow complete
    deactivate AOS

    Note over DMS,FVPService: Phase 2: LLMDocumentMatching and InhaltsverzeichnisMatching
    activate AOS
    AOS->>Temporal: Queue LLMDocumentMatching check job
    Temporal-->>FVPAgent: Run LLMDocumentMatching check job
    Note over FVPAgent: Processing time 10-20 minutes
    activate FVPAgent
    DMS->>FVPAgent: Get list of documents and extraction data
    FVPAgent->>FVPAgent: Run LLMDocumentMatching
    FVPAgent->>DMS: Write results to DMS via signed URL
    FVPAgent-->>Temporal: LLMDocumentMatching job completed
    deactivate FVPAgent
    Temporal-->>AOS: LLMDocumentMatching check complete
    deactivate AOS

    Note over DMS,FVPService: Phase 3: Store results in the FVPService
    AOS-->>FVPService: Start FVP result retrieval job
    activate FVPService
    DMS->>FVPService: Get FVP results via signed URL
    FVPService->>FVPService: Reformat results and save to database
    FVPService-->>AOS: FVP result retrieval job completed
    deactivate FVPService
```

### Dependencies

| Service | Purpose |
|---------|---------|
| **Modul Inhaltsextraktion** | Preprocessed text extraction data. *Full run on ~200 docs takes several hours.* |
| **Dienst Dokumentenmanagementsystem** | Document and extraction result storage |
| **Dienst Agentenorchestrierung** | Workflow entry point (triggered by frontend) |
| **Temporal** | Asynchronous workflow orchestration |
| **Dienst formale Vollständigkeitsprüfung** | Result persistence and frontend API |
| **LLM-Proxy** | Unified OpenAI-compatible LLM gateway |

## Getting Started

### Prerequisites

- `uv` package manager
- Shared platform services from the [root README](../../README.md#dependencies) when running locally

### Environment Variables

Create `.env` based on `.env.local`. Configure API keys, LLM settings, and service endpoints.

> **Windows (Critical):** Set `PYTHONUTF8=1` before running workflows, otherwise Umlaute / UTF-8 handling degrades classification performance.

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `LITELLM_MODEL` | LLM model identifier (routed via LiteLLM-Proxy) | — | yes |
| `LITELLM_BASE_URL` | LiteLLM-Proxy base URL *(deployment-set)* | — | yes |
| `LITELLM_MASTER_KEY` | LiteLLM-Proxy API key — secret, sourced from k8s `litellm-proxy-credentials` *(deployment-set)* | — | yes |
| `TEMPORAL_HOST` | Temporal server address | — | yes |
| `TEMPORAL_LLM_MAX_PER_SECOND` | Token-bucket rate limit for LLM activities | — | yes |
| `TEMPORAL_S3_BUCKET_NAME` | S3 bucket for large payload storage | — | yes |
| `TEMPORAL_S3_ENDPOINT_URL` | S3 endpoint URL | — | yes |
| `TEMPORAL_S3_ACCESS_KEY_ID` | S3 access key | — | yes |
| `TEMPORAL_S3_SECRET_ACCESS_KEY` | S3 secret key | — | yes |
| `TEMPORAL_S3_REGION` | S3 region | — | yes |
| `DMS_BASE_URL` | Document Management Service base URL | — | yes |
| `OTEL_SERVICE_NAME` | OpenTelemetry service name | — | yes |
| `OTEL_ENDPOINT` | OpenTelemetry collector endpoint | — | yes |

The worker task queue is fixed by the shared Temporal workflow contract.

### Running the Module

#### In Development

1. **Setup Python Environment**:
   ```bash
   uv venv --python 3.13
   uv sync --all-extras --inexact --package formale-pruefung
   ```
2. **Start Temporal**:
   ```bash
   # From repo root
   cd ../.. && docker compose up -d
   ```
   Alternatively, install [Temporal CLI](https://docs.temporal.io/cli) and use `temporal server start-dev`.
   
3. **Register the Temporal workers**:
   ```bash
   PYTHONPATH=. uv run main.py
   ```
   Restart after code changes.

4. **Trigger Workflows**:
   Workflows can be triggered programmatically via the backend orchestration service or manually via the Temporal Web UI.

   **Manual via Temporal UI:**

   Task Queue: `formale-pruefung`

   **LLMMatchingWorkflow** — `projectId` must reference a DMS project with the completed process of *Modul Inhaltsextraktion*. `documentIds` is optional (subset classification).  
   `data/document_types_sample.json` contains sample document types you can use to call the workflow. Adjust these to your use case.

   ```json
   {
      "projectId": "00000000-0000-0000-0000-000000000000",
      "documentTypes": [
         {
            "category": "Category (e.g. Allgemeiner Teil)",
            "documentTypeName": "Document Type (e.g. Erläuterungsbericht)",
            "documentTypeDescription": "A very precise description.",
            "expectedCount": null
         }
      ],
      "documentIds": null
   }
   ```

   **InhaltsverzeichnisMatchingWorkflow:**
   ```json
   {
      "projectId": "00000000-0000-0000-0000-000000000000",
      "documentTypes": [...]
   }
   ```

#### In Production

Start Temporal workers and platform services from the repo root:

```bash
cd ../.. && docker compose up -d
```

Trigger workflows programmatically via backend orchestration or via the Temporal Web UI.

## Project Structure

```
├── main.py                 # Temporal worker entry point
├── data/                   # Sample document type definitions
├── src/
│   ├── activities/         # Temporal activities (I/O operations)
│   ├── config/             # Configuration and environment variables
│   ├── models/             # LLM client factories
│   ├── prompts/            # LLM prompt templates
│   ├── schemas/            # Pydantic data models
│   ├── services/           # External service clients (DMS)
│   ├── utils/              # Shared utilities
│   └── workflows/          # Temporal workflows (orchestration logic)
```

## Monitoring

- **Temporal UI:** Monitor workflow executions, activity retries, and execution history at [http://localhost:8233](http://localhost:8233).
- Monitor the upstream workflows of *Modul Inhaltsextraktion* and the DMS data, as their failure can cause FVP workflows to fail.

## Troubleshooting

<details>
<summary>Low Classification Accuracy</summary>

Verify that `document_type_description` fields are precise and non-overlapping. Vague or generic descriptions significantly degrade matching quality.

</details>

<details>
<summary>UTF-8 Issues on Windows</summary>

Set `PYTHONUTF8=1` before running any workflows. Without this, Umlaute in prompts and documents may be corrupted, reducing classification performance by more than 50%.

</details>

<details>
<summary>Temporal Worker Not Picking Up Jobs</summary>

Ensure the worker is registered on the correct task queue (`formale-pruefung`) and that Temporal Server is reachable at the configured URL. Restart the worker after code changes.

</details>

<details>
<summary>Workflows Failing Immediately</summary>

Verify that the required extraction data exists in the DMS. The *Modul formale Vollständigkeitsprüfung* requires the process of *Modul Inhaltsextraktion* to complete successfully first, which can take multiple hours for a full application.

</details>

<details>
<summary>LLM API Rate Limits (429 Errors)</summary>

Check your LLM provider quotas and deployment configuration. Consider adjusting rate limits in the LiteLLM-Proxy.

</details>

> **Note:** LLM outputs are inherently non-deterministic. Results may vary slightly between runs on identical inputs.
