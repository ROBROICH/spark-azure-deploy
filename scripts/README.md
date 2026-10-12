# Local Development Scripts

Use the root Poe tasks when possible so commands are discoverable:

- `uv run poe create-secrets` creates a private `.env` with shared local secrets.
- `uv run poe process-compose` starts the native service stack from `process-compose.yaml`.

## Security Scan

`security_scan.sh` uses `TRIVY_IGNORE_FILE` when it points to an existing Trivy ignore file. If the default ignore file is absent, the scan continues without `--ignorefile`.

## Local Setup

Follow the canonical [First Local Start](../README.md#first-local-start) and [local verification](../README.md#verify-the-local-stack) procedures in the root README. They cover secret regeneration, external services, Docker Compose, Process Compose, owner-port routing, and workflow checks.
