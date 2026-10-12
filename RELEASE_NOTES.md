### Release 0.3.0 "Waldkauz" — 2026-10-12

Release 0.3.0 consolidates the backend services into a single TypeScript backend, is certified accessible under BITV 2.0, and can be adapted to the procedures of each authority. It also makes the AI-supported checks more transparent with a reworked plausibility check and review hints for AI suggestions.

#### Highlights

##### Single TypeScript backend

The backend services are consolidated into a single TypeScript backend. It ships as one image (`spark-backend`), stores its data in one PostgreSQL database and applies its own database migrations at startup, which makes SPARK Workflow simpler to deploy and operate.

##### Accessibility certified under BITV 2.0

Since September 2026, SPARK Workflow has been certified under the German Accessible Information Technology Ordinance (BITV 2.0) and thus meets the statutory requirements for digital accessibility. Between June and September 2026, the application was tested by ITZBund against BITV 2.0 and EN 301 549 and found to conform to the requirements. This release includes the related improvements for screen readers, Windows Contrast Mode and 400% zoom, and an updated accessibility statement.

##### Adaptability to procedures

Administrators configure project types directly in the application: topic catalogs with their legal bases, required documents and decision templates. Authorities can adapt SPARK Workflow to their own procedures without changing code.

##### Review hints for AI suggestions

The AI-supported checks show where a closer review is needed. Uncertain document assignments in the formal completeness check and uncertain objection classifications are flagged, and the material completeness check marks the findings to review first.

#### Included scope

* Single TypeScript backend, shipped as one image (`spark-backend`) with one PostgreSQL database
* Reworked plausibility check: more sources for possible contradictions, trivial passage pairs skipped, a relevance score from two independent assessments, and merged duplicate findings
* Administration of project types: topic catalogs with legal bases, required documents and decision templates
* Deployment option for a standalone objection-management application
* Review hints for AI suggestions in the formal and material completeness checks and in objection classification
* Failed processing runs shown with their cause
* Rasterization of CAD and GIS plan sheets in content extraction
* German user manual as a searchable website
* Accessibility improvements for screen readers, Windows Contrast Mode and 400% zoom, and an updated accessibility statement

#### Upgrading from 0.2.x

With the new backend architecture, 0.3.0 is set up as a new installation and starts with an empty database.

##### Deployment

1. Before switching to 0.3.0, let running Temporal workflows finish or terminate them; they cannot be continued afterwards.
2. Create a new, empty PostgreSQL database `application` with ICU support and the roles `application_runtime` and `application_migrator`, which must be a member of `application_owner`. Grant DDL privileges only to `application_migrator`; the schema migrations grant `application_runtime` the data access it needs. Data from 0.2.x is not migrated.
3. Deploy the single backend image `spark-backend`. `ACTIVE_FEATURE_WORKER` selects the background worker an instance runs (`none`, `agent-orchestration`, `document-management`, `project-logic` or `temporal-job`). The backend applies database migrations at startup using `DB_MIGRATE_HOST`, `DB_MIGRATE_USER` and `DB_MIGRATE_PASSWORD`.
4. Environment variables:
   * New required: `MAX_OBJECT_SIZE_MB`, `MAX_ZIP_APPENDED_DATA_BYTES`, `FPP_BLOCK_PRIVATE_IPS`; `ARCHIVAL_ENCRYPTION_KEY` when history archiving is enabled
   * Renamed: `TEMPORAL__*` → `TEMPORAL_*`; `FPP__*` → `FPP_*` (including `FPP__KEYCLOAK_TOKEN_URL` → `FPP_OIDC_TOKEN_URL`); `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_TOKEN_URL` → `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_TOKEN_URL` in content extraction
   * Ignored, as they configured the separate 0.2.x backend services: `API__*_BASE_URL`, `<SERVICE>_DB_*`, CORS variables (except `PROJECT_LOGIC_SERVICE_CORS_ORIGINS`), `RECONCILER_*`, `*ALLOWED_FILE_*`, `DB_POOL_*`
5. Reinstall from the new Helm charts (umbrella chart with a shared backend pool chart); values and secret keys have changed, so existing values files cannot be reused unchanged.
6. Assign the administrator and user roles in your OIDC identity provider; the application no longer changes roles. Users without the administrator role only see procedures they are a member of, so make sure users are members of the procedures they work on.

##### API clients

* Payloads and query parameters use camelCase; requests with unknown fields are rejected with 422
* Lists of projects, deadlines, comments, supplementary requests and documents of the formal completeness check are paginated (50 by default, at most 200)
* `/temporal/workflows/{projectId}/by-type` moves to `/temporal/workflows/by-type/{projectId}`, and `/{id}/document-assignments` of the formal completeness check is replaced by `/documents`
* The API reference moves from `/docs` to `/openapi`; Prometheus `/metrics` endpoints are removed and telemetry is exported through OpenTelemetry (OTLP)

##### Local development

* Install Bun 1.4.0 and Process Compose 1.76.1 or later (see "Prerequisites" in `README.md`)
* VersityGW replaces MinIO; existing local volumes are not migrated, so remove them and regenerate `.env` with `scripts/create_secrets.sh`

#### Security

* Role switching for permission testing is available only in development, testing and staging environments and requires the `test-role-switcher` role
* Permission checks are applied consistently to all project-related API requests; logs redact credentials and user data, and error responses are reduced to the information needed
* PDF anonymization stops with an error if OCR or PII detection fails, instead of returning partly unredacted pages, and removes metadata, annotations, forms, embedded files and orphaned signature widgets
* File uploads and downloads of source documents are size-limited; planning-portal downloads accept only HTTPS from allow-listed hosts
* Legal-norm and case-law ingestion accepts only expected file types and no longer loads cache files that can execute code

#### Removed

* Python backend HTTP services, replaced by the TypeScript backend
* Local reverse-proxy setup, the MinIO proxy and the quick-start scripts

See [CHANGELOG.md](CHANGELOG.md) for the complete list of changes.

---

### Release 0.2.3 — 2026-10-12

Release 0.2.3 is mainly a security and maintenance release of the 0.2 line. It gives the fixes published on OpenCoDE since 0.2.2 a version of their own, ahead of the next larger release with the consolidated backend. A major improvement is the switch of the Python services to hardened runtime images from ZenDiS (Zentrum für Digitale Souveränität der Öffentlichen Verwaltung), which are publicly available on OpenCoDE. The release contains no new features. Operators of 0.2.x should update, because it closes a personal-data leak in PDF redaction. Included changes:

* PDF redaction no longer leaks content through page objects that remain referenced outside the page tree (#40)
* Dependency updates close known CVEs, including anyio 4.14.2
* Python services use ZenDiS hardened runtime images
* Document management signs internal upload URLs with the internal storage endpoint
* Formal completeness check prompt fields match their output schemas
* DevGuard CI templates are upgraded to version 1.14.0
* Helm charts reference the 0.2.3 service images

See [CHANGELOG.md](CHANGELOG.md) for the complete list, including changes added to the 0.2.2 entry.

---

### Second Release — 2026-06-15

Release two adds substantive completeness check, legal review and assessment, and the drafting of decisions, together with the participation of public authorities and the public, cross-cutting operational functions, and deployment assets. From this release onward, SPARK supports the complete handling of applications. This release completes the open-source publication. The main frontend is published with this release. Included scope:

* Material completeness check
* Legal review and assessment
* Drafting of decisions
* Risk reporter (part of drafting of decisions)
* Handling of legal changes
* Handling of plan changes
* Job status display
* Authority and public participation
* Roles and rights management
* Approval workflows
* User management
* Logging
* Personal information redaction function
* Feedback mechanism
* Frontend
* Complete backend services
* Legal dogmatics
* Helm charts for deployment