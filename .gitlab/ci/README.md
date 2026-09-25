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

The pipeline is split into one repository test stage and ten batched service pipeline stages:

```yaml
stages:
  - test
  - service-pipelines-1
  - service-pipelines-2
  - service-pipelines-3
  - service-pipelines-4
  - service-pipelines-5
  - service-pipelines-6
  - service-pipelines-7
  - service-pipelines-8
  - service-pipelines-9
  - service-pipelines-10
```

The `test` stage runs DevGuard repository checks:

- Secret scanning
- Static application security testing
- Infrastructure-as-code scanning
- Software composition analysis

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

The shared service template wraps the DevGuard `v1.14.0` OCI templates directly:

- `generate-tag.yml`
- `build-oci-image.yml`
- `container-scanning.yml`
- `push-oci-image.yml`
- `sign-oci-image.yml`
- `attest.yml`

The template accepts these inputs:

```yaml
job_suffix
image_suffix
artifact_name
context
dockerfile
base_image_dev
base_image
```

`base_image_dev` and `base_image` are passed to Kaniko as the Docker build arguments `BASE_IMAGE_DEV` and `BASE_IMAGE`. This lets each service child pipeline select its build and runtime images without changing the shared template.

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

Each service trigger watches:

- The service source directory
- The service child pipeline file
- The shared DevGuard OCI template
- `.gitlab-ci.yml`
- `pyproject.toml`
- `uv.lock`

`uv.lock` and `pyproject.toml` intentionally trigger all service pipelines because dependency changes can affect any Python service build.

## Merge Requests

Merge request pipelines are enabled and run on the merge request source branch commit.

For merge requests:

- The top-level `test` stage runs.
- Service image child pipelines are skipped.

For pushes or web pipelines on `main`:

- The `test` stage runs.
- Changed services build, scan, push, sign, and attest.

For tags:

- All service image pipelines run.
