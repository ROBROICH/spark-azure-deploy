# Changelog

All notable changes to this project will be documented in this file.

---

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

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