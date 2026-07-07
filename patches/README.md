# Azure demo overlay patches

This directory holds the **complete set of source modifications** the Azure/OpenAI
demo makes to the upstream [openCode SPARK Workflow](https://gitlab.opencode.de/bmds/planungs-und-genehmigungsbeschleunigung/spark-workflow)
codebase. Everything else the demo adds (`infra/`, `scripts/azure/`, `azure.yaml`,
`.github/workflows/`) is *additive* and lives alongside upstream without conflict —
only the edits to files that upstream also owns need to be tracked here as patches.

Keeping these changes as a patch series (instead of hand-edits scattered through the
tree) is what lets the **sync-and-build pipeline** pull a fresh upstream release and
re-apply the demo adjustments deterministically.

## Baseline

The patches are generated against **`origin/main`** — the upstream mirror tip. Diffing
against `origin/main` (rather than the `spark-workflow-0.2` tag) isolates *our* changes
and excludes upstream's own post-release commits.

## The patches

| Patch | What it changes | Why |
|-------|-----------------|-----|
| `0001-llm-openai-direct.patch` | `llm-client` (`_shared.py`, `llm.py`, `vlm.py`, `env.py`, `embedding.py`) | The demo calls the OpenAI-compatible API directly (no multi-provider LiteLLM proxy). Collapses provider-prefixed routing aliases (`self-hosted/*`, `gcp/*`) to the configured `TEXT_MODEL` / `EMBEDDING_MODEL`, handles reasoning-model parameter rules, drops proxy-only request fields, and marks HTTP 400 as non-retryable (cost-safety, so a malformed request fails fast instead of retrying). |
| `0002-embedding-dimensions.patch` | `db_services_shared/llm/embeddings.py`, `modul-inhaltsextraktion/.env.local` | Aligns embedding dimensions per vector store: the legal pgvector DBs request **1024-dim** embeddings (to fit `VECTOR(1024)` columns), while the Qdrant document-extraction collection uses OpenAI's native **1536**. |
| `0003-dms-range-download.patch` | `modul-formale-pruefung` + `modul-plausibilitaet-pruefung` `dms_client.py` | Downloads DMS objects via **HTTP Range requests** in sub-64 KiB chunks to work around a ~64 KiB response-body cap in the object-storage serving path (the public MinIO reverse proxy). |
| `0004-agent-orchestration-resilience.patch` | `agent_orchestration_service` (`probes_routes.py`, `lifespan.py`, `app_state.py`, `fvp.py`) | Readiness probe reports `503` when the Temporal worker has died (so Container Apps recycles the replica), surfaces silent worker crashes in the console logs, and relaxes the FVP workflow-ID reuse policy so a failed review can be re-run. |
| `0005-rechtsmethodik-skip-missing-norms.patch` | `modul-rechtsmethodik/law_api_calls.py`, `agent_orchestration_service` MVP `workflow.py` + unit test | Skips legal norms that are absent from the seeded `gesetze-normen-db` (e.g. state laws not in the federal-only seed) instead of hard-failing the whole review batch. |
| `0006-frontend-gateway-auth.patch` | `01-frontend/frontend/docker-entrypoint.sh` | Injects the gateway bearer token into the nginx `/api` proxy config at container start; safely drops the header when the token is unset (local dev). |
| `0007-local-dev-utf8.patch` | `process-compose.yaml` | Forces UTF-8 file I/O so German umlauts in seed data read correctly on Windows. No-op on Linux/macOS; **local-dev convenience only**, not required for the Azure deployment. |
| `0008-cost-safety-retry-bounds.patch` | shared Temporal activities (`temporal/activities/llm.py`, `vlm.py`) | Cost-safety: bounds the LLM/VLM activity retry policy to **10** attempts (was 30) so a persistently-failing model call cannot keep burning tokens/quota. Pairs with the HTTP-400-non-retryable change in patch 0001 and the Azure Budget in `infra/main.bicep`. |

## Not included

- **`02-backend/administrative_file_draft/src/template.docx`** — the working tree has a
  binary change to this template (40 KB → 176 KB). Binary edits are excluded from the
  patch series; verify whether this change is intentional (a demo template override) or
  an accidental local re-save before relying on it.

## Applying

Run from the repository root (idempotent — already-applied patches are skipped):

```bash
./patches/apply-patches.sh      # Linux / CI
```

```powershell
./patches/apply-patches.ps1     # Windows / local
```

Each patch is applied with `git apply`. If upstream has drifted enough that a patch no
longer applies cleanly, the script fails on that patch — that is the intended signal to
reconcile the change against the new upstream and regenerate the series.

## Regenerating

After adjusting a source file, regenerate the affected patch from the repo root, e.g.:

```bash
git diff origin/main --output=patches/0001-llm-openai-direct.patch -- \
  04-shared-services/llm/llm-client/src/llm_client/_shared.py \
  04-shared-services/llm/llm-client/src/llm_client/llm.py \
  04-shared-services/llm/llm-client/src/llm_client/vlm.py \
  04-shared-services/llm/llm-client/src/llm_client/env.py \
  04-shared-services/llm/llm-client/src/llm_client/embedding.py
```

> The current working tree **already has these changes applied**. The patch series
> documents them and enables clean re-application onto a freshly-synced upstream in the
> build pipeline. Migrating the tracked source back to pristine-upstream (so the mods
> live *only* here) is a later, optional step.
