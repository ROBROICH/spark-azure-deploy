# GitLab CI Pipeline Structure

This project uses DevGuard-powered GitLab CI for repository security checks and OCI image build, scan, push, sign, and attestation.

## Background

The previous pipeline used the DevGuard `full.yml` component as a single, broad pipeline:

```yaml
stages:
  - test
  - oci-image
  - attestation

include:
  - remote: "https://gitlab.opencode.de/l3montree/devguard-ci-components/-/raw/v1.4.0/templates/full.yml"
    inputs:
      devguard_asset_name: "$DEVGUARD_ASSET_NAME"
      devguard_token: "$DEVGUARD_TOKEN"
      devguard_api_url: "$DEVGUARD_API_URL"
      devguard_web_ui: "https://devguard.opencode.de"
```

That approach was compact, but it did not work well for this repository because it built too broadly and did not give enough control over artifact naming and per-service execution.

## Current Design

The pipeline is split into one repository test stage and six batched service pipeline stages:

```yaml
stages:
  - test
  - service-pipelines-1
  - service-pipelines-2
  - service-pipelines-3
  - service-pipelines-4
  - service-pipelines-5
  - service-pipelines-6
```

The `test` stage runs DevGuard repository checks:

- Secret scanning
- Static application security testing
- Infrastructure-as-code scanning
- Software composition analysis

## Backend Modulith Migration

The 15 legacy backend service triggers and child pipeline files have been
removed. Their images no longer build, even before the replacement source
arrives. Backend source directories and DiPlan are unchanged by this CI migration.

The new `spark-backend` trigger and TypeScript checks activate only when
`02-backend/apps/spark-backend/package.json` exists. This guard also applies to
tags, so CI remains usable before the source migration lands. The migration
must bring the complete workspace: the host app, feature and shared packages,
root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, TypeScript/Vite
configuration, required scripts, and `02-backend/apps/Dockerfile`.

The child pipeline `.gitlab/ci/services/spark-backend.yml` owns the bundle:

```text
typescript-bundle -> oci-image -> attestation
```

Its `typescript-build` job uses `node:22.23.2`, enables Corepack, activates the
root package's pinned pnpm version, installs with `--frozen-lockfile`, and
builds only `@spark-workflow/spark-backend` with `NODE_ENV=production`. It publishes
`02-backend/apps/spark-backend/dist/` as an artifact. The image job downloads
that artifact through a local `needs` dependency and uses it as the Docker
context with `02-backend/apps/Dockerfile`. No parent bundle, cross-pipeline
artifact download, or DiPlan build is required.

The `spark-backend` trigger runs only after successful parent checks. Its image
is built, pushed, scanned, signed, and attested using the existing DevGuard
settings; this pipeline does not deploy it or update GitOps overlays.

## Handbook GitLab Pages

The parent pipeline includes `.gitlab/ci/templates/handbuch-pages.yml`. Its
`pages` job runs in the `test` stage, independently of service image pipelines.
It builds the static application in `01-frontend/handbuch` from the Markdown and
images in `docs/handbuch`, using Node.js 24 and the application's pinned pnpm
version. The job derives `HANDBUCH_BASE_PATH` from `CI_PAGES_URL` so assets,
links, and search work on both unique domains and project-path Pages URLs, then
publishes `dist/public` as the root `public` artifact.

Pages runs on default-branch pushes only when one of these paths changes:

- `01-frontend/handbuch/**/*`
- `docs/handbuch/**/*`
- `.gitlab/ci/templates/handbuch-pages.yml`

A manually started web pipeline on the default branch also publishes the
handbook. If `BUILD_SERVICE` is set, it must be `All` or `handbuch` for that
manual run. Merge-request and tag pipelines do not publish Pages. GitLab Pages
must be enabled for the project; the deployment URL is available under
**Deploy > Pages**.

For local verification, run `types:check` and `build` as described in
[`01-frontend/handbuch/README.md`](../../01-frontend/handbuch/README.md), and build
with `HANDBUCH_BASE_PATH=/pages-test/` to check project-path hosting. Validate the
merged GitLab CI configuration for changed and unchanged default-branch pushes,
manual web runs, merge requests, and tags.

## Scan Failure Policy

Secret scanning, static application security testing, and infrastructure-as-code scanning are non-blocking. Their findings remain visible in DevGuard, but these jobs are allowed to fail without failing the pipeline.

Software composition analysis is blocking for open findings with a high or critical risk level, or a critical CVSS score:

```yaml
devguard_artifact_name: "pkg:generic/spark-workflow-monorepo"
fail_on_risk: "high"
fail_on_cvss: "critical"
```

The repository software composition analysis uses the PURL-compatible generic artifact name `pkg:generic/spark-workflow-monorepo`.

Container scanning uses the same thresholds in the shared service template, so every service child pipeline fails when its image has an open high or critical risk finding, or a critical CVSS finding. Lower-severity findings remain visible without blocking the pipeline.

The `service-pipelines-*` stages contain child pipeline triggers for deployable services. Each batch contains at most three service triggers, which limits service child-pipeline fan-out and reduces runner timeouts. Each service has its own child pipeline file in:

```text
.gitlab/ci/services/
```

Each service child pipeline includes the shared local DevGuard OCI template:

```text
.gitlab/ci/templates/devguard-oci-service.yml
```

## Service Template

The shared service template includes these DevGuard `v1.16.0` OCI templates directly:

- `generate-tag.yml`
- `container-scanning.yml`
- `sign-oci-image.yml`
- `attest.yml`

Repository security checks also use DevGuard `v1.16.0` templates. All remote
DevGuard includes use SHA-256 integrity pins; update the version and integrity
value together.

The local build job uses the digest-pinned Kaniko `v1.28.3` image bundled with
scanner `v1.12.4`, matching DevGuard's upstream `v1.16.0` build template, which
is unchanged from `v1.15.0`.

The template accepts these inputs:

```yaml
job_suffix
image_suffix
artifact_name
context
dockerfile
base_image_dev
base_image
build_needs
```

`base_image_dev` and `base_image` are passed to Kaniko as the Docker build arguments `BASE_IMAGE_DEV` and `BASE_IMAGE`. This lets each service child pipeline select its build and runtime images without changing the shared template. Both default to an empty string for Dockerfiles that pin their own images, such as the TypeScript runtime Dockerfile.

`build_needs` defaults to an empty array. A child can supply local artifact-producing
jobs here; the image job downloads their artifacts alongside the generated tag.
Existing frontend and Python children require no additional build dependencies.

Example service child pipeline:

```yaml
stages:
  - oci-image
  - attestation

include:
  - local: ".gitlab/ci/templates/devguard-oci-service.yml"
    inputs:
      job_suffix: ":frontend"
      image_suffix: "frontend"
      artifact_name: "pkg:oci/frontend"
      context: "$CI_PROJECT_DIR/01-frontend/frontend/."
      dockerfile: "$CI_PROJECT_DIR/01-frontend/frontend/Dockerfile"
      base_image_dev: "node:24-alpine3.23"
      base_image: "nginx:1.30-alpine3.23-slim"
```

## Why The DevGuard Templates Are Included Directly

The DevGuard lifecycle wrapper did not reliably propagate custom artifact names into the scan and attestation jobs. Directly including the underlying templates lets the pipeline pass the same `devguard_artifact_name` to both `container-scanning.yml` and `attest.yml`.

DevGuard artifact names use Package URL (PURL) format. Service OCI artifacts use `pkg:oci/<service-name>`, for example:

```text
pkg:oci/frontend
```

The repository software composition analysis uses `pkg:generic/spark-workflow-monorepo` because it represents the monorepo rather than a container image.

## Build And Push Flow

The service template intentionally uses a local `devguard:build_oci_image...` job instead of the upstream DevGuard `build-oci-image.yml` component.

The upstream component supports pushing images directly with `push_image: "true"`, but it still declares `image.tar` as a GitLab artifact. Large service images can exceed the GitLab artifact upload limit and fail with:

```text
413 Request Entity Too Large
```

To avoid that, the local build job mirrors the DevGuard build behavior but changes the artifact flow:

- Kaniko builds the image.
- Kaniko pushes the image directly to GitLab Container Registry.
- The job resolves the pushed image digest with `crane digest`.
- The job uploads only small artifacts:
  - `image-digest.txt`
  - `build.provenance.json`
  - `variables.env`

The pipeline no longer uploads `image.tar` to GitLab artifacts.

This changes the flow from:

```text
build image.tar -> upload image.tar -> scan image.tar -> push image
```

to:

```text
build and push image -> scan image from registry
```

The build job still records DevGuard in-toto/SLSA provenance by wrapping the Kaniko build with:

```bash
/devguard-scanner intoto start --step=build ...
/devguard-scanner intoto stop --step=build --products=image-digest.txt --generateSlsaProvenance ...
```

The generated `build.provenance.json` is later attached by the attestation job.

## Image Tag Handling

Build jobs push images directly to the GitLab container registry with a branch-and-commit-specific image tag:

```yaml
$CI_REGISTRY_IMAGE/<image-suffix>:$CI_COMMIT_REF_SLUG-$CI_COMMIT_SHA-amd64
```

For example:

```text
registry.gitlab.com/.../frontend:main-a12b68f6c9e4d7b1f3a2c5e8d9f0a1b2c3d4e5f6-amd64
```

The build job exports a digest-qualified `IMAGE_TAG` in `variables.env`, for example:

```text
registry.gitlab.com/.../frontend:main-a12b68f6c9e4d7b1f3a2c5e8d9f0a1b2c3d4e5f6-amd64@sha256:...
```

Container scanning reads the pushed image back from the registry instead of scanning an uploaded `image.tar` artifact. This avoids GitLab artifact size limits for large service images.

The registry tag is also used by the sign job:

```yaml
image: "$CI_REGISTRY_IMAGE/<image-suffix>:$CI_COMMIT_REF_SLUG-$CI_COMMIT_SHA-amd64"
```

This keeps image tags from being overwritten on every `main` build and ensures the registry tag exists before signing. Without pushing a plain tag, signing can fail with `MANIFEST_UNKNOWN` because the pushed image may only be addressable by digest.

## Per-Service Execution

The parent `.gitlab-ci.yml` contains one trigger job per service. Service image pipelines run only when relevant files change.

Frontend and Python service triggers watch:

- The service source directory
- The service child pipeline file
- The shared DevGuard OCI template
- `.gitlab-ci.yml`
- `pyproject.toml`
- `uv.lock`

`uv.lock` and `pyproject.toml` select the existing frontend and Python service
pipelines, not `spark-backend`.

The TypeScript checks and `spark-backend` trigger share a change list covering
the host app, backend features, shared packages, scripts, root pnpm manifests
and lockfile, Vite configuration, shared TypeScript Dockerfile, and relevant CI
files. On pushes and merge requests, an unrelated service-only change does not
select the modulith checks or build. Web pipelines have no push diff, so GitLab
treats `changes` as true and selects all available services, including the
modulith once its source exists.

## Merge Requests

Merge request pipelines are enabled and run on the merge request source branch commit.

For merge requests:

- The top-level `test` stage runs.
- TypeScript checks run when the modulith source exists and watched files change.
- Service image child pipelines are skipped.

For pushes or web pipelines on `main`:

- The `test` stage runs.
- Pushes select changed services; web pipelines select all available services.
  Selected services build, scan, push, sign, and attest.
- `spark-backend` runs only when its source exists and parent checks succeed.

For tags:

- All remaining service image pipelines run; `spark-backend` requires its source
  to exist and parent checks to succeed.

### Migration verification

Validate parent and child configurations with GitLab CI lint/merged configuration
for MR, main push, web, and tag pipelines, both before and after the workspace
arrives. Confirm that no removed service is selected, absent modulith source
selects no TypeScript jobs, watched workspace changes select all TypeScript
checks and the eligible image child, and unrelated push/MR changes select neither.
Verify that each batch has at most three service triggers and every local
include resolves. After the source migration, run a real child pipeline to
verify bundle artifact download, image build, scanning, signing, and attestation.

## DevGuard 1.16 rollout checks

This upgrade keeps `https://devguard.opencode.de` and the existing
`DEVGUARD_API_URL`, assets, and credentials. Before activating the templates,
confirm the actual API behind that variable is compatible with minor version
`1.16`. Upstream guarantees compatibility within the same minor version; an
upgrade of the separate gitops-hosted instance does not satisfy this check.

Validate parent and representative child pipelines with GitLab CI lint/merged
configuration for MR, main-branch, web, and tag execution. Verify source and
container scans, unchanged high-risk/critical-CVSS blocking thresholds, image
signatures, and SBOM/VEX/SARIF/SLSA attestations. MR pipelines must continue to
skip service-image children. Shared CI changes select all services on eligible
main/tag pipelines, so budget runner capacity. Revert template URLs and integrity
pins together if needed. The backend CI migration is described separately above.
