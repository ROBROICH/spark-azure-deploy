# Changelog

All notable changes to this project will be documented in this file.

---

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

---

## [0.3.0] - 2026-10-12

### Added

* Deployment option to run SPARK Workflow as a standalone objection-management application with navigation limited to objection processing
* Review hints for AI suggestions: uncertain document assignments in the formal completeness check and uncertain objection classifications are flagged, and the material completeness check marks the findings to review first
* Administration area for configuring project types, including topic catalogs with legal bases, required documents and decision templates
* Failed processing runs are shown with their cause in the affected area of a procedure
* Content extraction rasterizes CAD and GIS plan sheets before conversion
* German user manual as a searchable website with its own container image

### Changed

* BREAKING: Backend services are consolidated into a single TypeScript backend image, `spark-backend`, that applies its own database migrations at startup
* BREAKING: Backend data is stored in a new, empty PostgreSQL database `application` that requires ICU support; there is no data migration from 0.2.x
* BREAKING: Temporal workflows still running from 0.2.x cannot be continued after the update
* BREAKING: Environment variables changed, including new required variables and the rename of `KEYCLOAK_*` to `OIDC_*`
* BREAKING: API payloads use camelCase, request bodies reject unknown fields, several lists are paginated and some endpoints moved
* BREAKING: Helm charts are restructured into an umbrella chart with a shared backend pool chart; values and secret keys changed
* BREAKING: The local stack requires Bun 1.4.0 and Process Compose 1.76.1 or later and replaces MinIO with VersityGW
* Plausibility findings are ranked by a new relevance score that combines two independent assessments, and duplicate findings, including document pairs checked in both directions, are merged
* The plausibility check uses repeated passages, copied sentences and cross-references as additional sources of possible contradictions and skips trivial passage pairs
* Legal review sentence details show the scope and type of discretion for each legal consequence instead of the addressee
* Lists of procedures, deadlines, appointments, documents, supplementary requests and comments load page by page
* Users without the administrator role only see procedures they are a member of; administrators still see all procedures
* Accessibility statement updated after the BITV 2.0 and EN 301 549 audit by ITZBund (June–September 2026)

### Fixed

* ZIP imports no longer fail on automatic retries because the uploaded archive was deleted too early, and encrypted, split or otherwise unsupported archives receive specific error messages
* Failed formal completeness checks can restart without uploading the documents again
* Formal completeness checks no longer fail on procedures with many documents
* Document matching for legal-norm requirements ranks documents by relevance instead of processing order
* Legal norm lookups no longer fail when the search returns only one result
* Inline markup no longer disrupts sentence splitting in legal norm texts
* The default topic catalog cites Article 28(2) of the Basic Law for "Kommunale Belange"
* A project number can be reused after the project is deleted
* Failed attempts to create, edit or delete a deadline are reported as errors instead of success
* Content extraction no longer fails on documents with many chapters
* Accessibility improvements for screen readers, Windows Contrast Mode and 400% zoom

### Removed

* Python backend HTTP services, superseded by the TypeScript backend
* Prometheus `/metrics` endpoints of the backend services, and `/docs` and `/redoc`; telemetry is exported through OpenTelemetry (OTLP) and the API reference is served at `/openapi`
* Local reverse-proxy setup and the MinIO proxy
* Quick-start scripts

### Security

* Users can no longer grant themselves the administrator role; role switching for permission testing is available only in development, testing and staging environments and requires the `test-role-switcher` role
* Permission checks are applied consistently to all project-related API requests, archived workflow histories are always encrypted, logs redact credentials and user data, and error responses are reduced to the information needed
* PDF anonymization stops with an error if OCR or PII detection fails, instead of returning partly unredacted pages, and removes metadata, annotations, forms, embedded files and orphaned signature widgets
* Case-law and legal-norm ingestion accepts only expected file types from downloaded archives, no longer loads executable caches, and downloads case law only over HTTPS
* File uploads and source downloads are size-limited, and planning-portal downloads accept only HTTPS from allow-listed hosts
* The objection CSV export neutralizes spreadsheet formulas

---

## [0.2.3] - 2026-10-12

### Changed

* Python services now use ZenDiS hardened runtime images
* DevGuard CI templates upgraded to version 1.14.0
* Helm charts now reference the 0.2.3 service images
* Community documentation and templates now use GitLab merge-request terminology

### Fixed

* Document management signs internal upload URLs with the internal storage endpoint
* Formal completeness check prompt fields now match their output schemas

### Security

* PDF redaction no longer leaks content through page objects that remain referenced outside the page tree ([#40](https://gitlab.opencode.de/bmds/planungs-und-genehmigungsbeschleunigung/spark-workflow/-/issues/40))
* Dependency versions were updated to close known CVEs, including anyio 4.14.2

---

## [0.2.2] - 2026-08-10

### Added

* German user manual and a repository-wide documentation index organized by purpose, target audience, and language
* README guidance on supported use cases, Temporal and S3 state handling, local-stack limitations, and maintaining the laws and norms database

### Changed

* DevGuard artifact identifiers now use Package URL (PURL) format for the monorepo and OCI service artifacts
* Service CI pipelines now accept explicit build and runtime base-image inputs
* Root README links directly to the user manual and documentation index and simplifies external AI service configuration
* Helm charts now reference service and infrastructure images in the OpenCoDE container registry
* Software composition and container scans now fail the pipeline on high and critical findings

### Fixed

* Restored reverse-proxy setup guidance in the root README
* Document chunking skips empty chunks
* Legal methodology handles missing law documents

### Security

* PDF redaction strips digital signatures before redacting
* Prompt-injection detection normalizes Unicode before matching markers
* The user list masks administrator roles

---

## [0.2.1] - 2026-07-15

### Added

* Legal-basis APIs and frontend support for browsing and assigning all available legal norms in the material completeness check
* Bidirectional plausibility checks for contradictions between documents
* Accessible, route-aware browser document titles and improved form validation focus handling
* Reverse-proxy support for the local stack, including Keycloak redirects and same-origin object-storage access
* Per-service GitLab CI pipelines for building, scanning, signing, and attesting OCI images
* Prompt-injection defense tests and the German technical product profile

### Changed

* Project-version creation now uses an explicit copy plan for more reliable workflow execution
* Authentication and request authorization were hardened, including validated body-based permission checks
* Dependency versions were updated to address security findings
* CI service pipelines are batched to limit runner fan-out; repository security scans are non-blocking

### Fixed

* Workflow cancellation now uses `POST` instead of `GET` to prevent unintended cancellation and CSRF
* Virus scanning now fails closed on ambiguous or unexpected scanner responses
* OCR-generated notes are removed more reliably before objections are processed
* ZIP extraction allows more time for uploads containing many or large files
* Tagged CI builds now produce the correct Docker image tags
* DevGuard jobs use the `if-not-present` pull policy to improve pipeline stability

### Removed

* Obsolete `internal-auth` shared package; authentication is consolidated in the `authentification` package

---

## [0.2.0-beta] - 2026-06-15

### Added

* Observability stack (`docker/observability`) and local Temporal setup (`docker/temporal`)
* `process-compose.yaml` for local orchestration
* Build, test, type-check, and security-scan scripts under `scripts/`
* Database seed for the gesetze-normen service
* Feature lists (EN/DE) and system-architecture documentation
* EWMS (objection management) frontend features and updated API clients

### Changed

* Service Dockerfiles are publicly buildable: base images parameterized via
  `ARG BASE_IMAGE_DEV` / `ARG BASE_IMAGE` (default `python:3.13-slim`),
  private-registry authentication removed from dependency installation
* Helm charts reorganized into a `helm/charts/sources/{internal,external}` layout
* Law-text parsers (state laws, EU-Lex) restructured in the database services
* Updates across document management, agent orchestration, and examination services
* Dependencies re-resolved (`pyproject.toml` / `uv.lock`); obsolete workspace members pruned

### Removed

* Pre-rendered Helm template output (charts are rendered directly)
* Oversized law-text test fixtures

---

## [0.1.0-beta] - 2026-03-31

### Added

* Content extraction from application documents
* Formal completeness checks
* Plausibility checks
* Supporting backend services

---

## Version Categories

Changes are grouped into the following categories:

- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for removed features
- **Fixed** for bug fixes
- **Security** for security fixes

---

## Notes

This file should be updated whenever significant changes are made to the project.

Before each release:

1. Move items from **Unreleased** into the new version section
2. Add the release date
3. Group changes into the appropriate categories
