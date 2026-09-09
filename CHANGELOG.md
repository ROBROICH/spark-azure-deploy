# Changelog

All notable changes to this project will be documented in this file.

---

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

---

## [0.2.2] - 2026-08-10

### Added

* German user manual and a repository-wide documentation index organized by purpose, target audience, and language
* README guidance on supported use cases, Temporal and S3 state handling, local-stack limitations, and maintaining the laws and norms database

### Changed

* DevGuard artifact identifiers now use Package URL (PURL) format for the monorepo and OCI service artifacts
* Service CI pipelines now accept explicit build and runtime base-image inputs
* Root README links directly to the user manual and documentation index and simplifies external AI service configuration

### Fixed

* Restored reverse-proxy setup guidance in the root README

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