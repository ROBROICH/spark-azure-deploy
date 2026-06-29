# GitLab CI Pipeline Structure

This project uses DevGuard-powered GitLab CI for repository security checks and OCI image build, scan, push, sign, and attestation.

## Current Design

The pipeline is split into two top-level stages:

```yaml
stages:
  - test
  - service-pipelines
```

The `test` stage runs DevGuard repository checks:

- Secret scanning
- Static application security testing
- Infrastructure-as-code scanning
- Software composition analysis

The `service-pipelines` stage contains one child pipeline trigger per deployable service. Each service has its own child pipeline file in:

```text
.gitlab/ci/services/
```

Each service child pipeline includes the shared local DevGuard OCI template:

```text
.gitlab/ci/templates/devguard-oci-service.yml
```

## Service Template

The shared service template wraps the DevGuard `v1.6.0` OCI templates directly:

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
```

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
      artifact_name: "spark-workflow-frontend-main-amd64"
      context: "$CI_PROJECT_DIR/01-frontend/frontend/."
      dockerfile: "$CI_PROJECT_DIR/01-frontend/frontend/Dockerfile"
```

## Why The DevGuard Templates Are Included Directly

The DevGuard lifecycle wrapper did not reliably propagate custom artifact names into the scan and attestation jobs. Directly including the underlying templates lets the pipeline pass the same `devguard_artifact_name` to both `container-scanning.yml` and `attest.yml`.

The artifact names intentionally avoid `/` characters, for example:

```text
spark-sandbox-frontend-main-amd64
```

This avoids encoded-slash routing issues when DevGuard artifact names are used in API paths.

## Image Tag Handling

Build jobs use the generated DevGuard image tag:

```yaml
image_tag: "$IMAGE_TAG"
```

Push jobs use an explicit plain tag:

```yaml
image_tag: "$CI_REGISTRY_IMAGE/<image-suffix>:$CI_COMMIT_REF_SLUG-amd64"
```

This ensures the registry tag exists before the sign job runs. Without this, signing can fail with `MANIFEST_UNKNOWN` because the pushed image may only be addressable by digest.

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