# SPARK on Azure — operational guide

Operational companion to the [Deploy to Azure](../README.md#deploy-to-azure) section.
This is a **demo** deployment: a no-refactor lift-and-shift of the openCode SPARK
Workflow onto Azure Container Apps (ACA), with the LLM pointed at an external
OpenAI-compatible endpoint. It is not a production configuration — see the
[Security Notice](../README.md#security-notice).

## Architecture on Azure Container Apps

- **App tier** (internal ingress): ~18 FastAPI services + ~10 AI-module workers +
  the `llm-client`. Images come from a public registry (GHCR) or a private ACR.
- **Infra apps** (min-1, ephemeral filesystem): `postgresql`, `temporal`, `qdrant`,
  `minio` (S3), `spicedb` (authz), `keycloak` (identity). Names match the local
  compose hostnames so no service config changes are needed.
- **Public edge**: `frontend` (nginx serving the SPA *and* the `/api` gateway),
  `minio-public` (presigned-URL reverse proxy), `temporal-ui` (Basic-Auth gated).
- **Foundations** ([infra/main.bicep](../infra/main.bicep)): Log Analytics, the ACA
  managed environment, Key Vault, a Storage account, an optional ACR, and an optional
  cost **Budget**.

The four stores run on the container's ephemeral disk (no mounted volume), which keeps
cost low; durability is provided by the snapshot/seed mechanism below.

## Deploy flow (`azd up`)

`azd up` = provision `infra/main.bicep`, then the `postprovision` hook
[scripts/azure/deploy-all.ps1](../scripts/azure/deploy-all.ps1), which runs, in order:

1. generate store secrets into Key Vault (and the LLM key from `SPARK_LLM_API_KEY`);
2. deploy the stores (`postgresql`, `qdrant`, `minio`, `spicedb`);
3. deploy the `snapshots` share + snapshot/rehydrate jobs;
4. **seed** the golden demo content (see below);
5. `temporal` + `temporal-init`;
6. auth (`setup-auth.ps1`: Keycloak realm + a long-lived gateway token);
7. SpiceDB schema;
8. the ~28 app-service Container Apps (`app-env.json` regenerated for this domain);
9. `minio-public`; 10. `frontend`; 11. `temporal-ui`; 12. report the URL.

## LLM configuration

All LLM/embedding settings are deploy-time environment variables (defaults preserve
the OpenAI demo):

| Variable | Default | Notes |
|----------|---------|-------|
| `SPARK_LLM_BASE_URL` | `https://api.openai.com/v1` | Azure OpenAI: `https://<res>.openai.azure.com/openai/v1/` |
| `SPARK_TEXT_MODEL` | `gpt-5.4-mini` | Azure OpenAI: the *deployment* name |
| `SPARK_EMBEDDING_MODEL` | `text-embedding-3-small` | pinned to the seeded corpus — changing it requires re-seeding |
| `SPARK_LLM_API_KEY` | — | OpenAI or Azure OpenAI key; stored in Key Vault |

Azure OpenAI works through the standard OpenAI SDK via the `/openai/v1/` endpoint (key
in the `Authorization` header; no `api-version` needed), so **no code change** is
required to switch providers. Embedding dimensions are intentionally different per
store (Qdrant extraction = 1536 native, legal pgvector DBs = 1024) — do not "unify"
them.

## Seeding the demo content (golden snapshot)

The demo case, the legal corpus + synthetic embeddings, the document blobs, and the
SpiceDB authorization data are shipped as a portable **seed pack** and rehydrated on
deploy.

- **Produce** (maintainer, once):
  `./scripts/azure/make-seed-pack.ps1 -Compress` against a known-good live environment.
  It snapshots the live stores and downloads the `snapshots` share into
  `seed-pack.tar.gz`. Publish it (e.g. as a release asset).
- **Consume** (every deploy): set `SPARK_SEED_PACK_URL` (or `SPARK_SEED_PACK_PATH`);
  [seed-demo.ps1](../scripts/azure/seed-demo.ps1) uploads it into the environment's
  `snapshots` share and runs [restore-all.ps1](../scripts/azure/restore-all.ps1). With
  no seed pack configured, deployment still succeeds but the stores start empty.

## Operating

- **Access**: frontend at the printed URL (optionally IP-restricted via
  `SPARK_ALLOWED_IPS`). Temporal UI Basic-Auth password:
  `az keyvault secret show --vault-name <kv> -n basic-auth-password --query value -o tsv`.
- **Pause / resume** (save cost on the ephemeral stores without losing state):
  `./scripts/azure/pause-demo.ps1 -ResourceGroup <rg>` snapshots the stores and scales
  everything to zero; `./scripts/azure/resume-demo.ps1 -ResourceGroup <rg>` restarts and
  rehydrates.
- **Teardown**: delete the resource group, or `azd down`.

## Cost (indicative)

Always-on footprint (min-1/max-1, no autoscale) is ~19 vCPU / ~38 GiB across ~37
Container Apps. On ACA Consumption rates that is roughly **\$650–950/month** if left
running (memory is the fixed floor; vCPU varies with activity), plus Log Analytics,
Key Vault, and storage. **OpenAI / Azure OpenAI tokens are billed separately.** Cost
guardrails: `SPARK_BUDGET_EMAILS` enables an Azure cost alert; the LLM retry policy is
bounded and HTTP 400 is non-retryable to prevent runaway token spend; keep a
provider-side budget cap.

## Security posture (demo-grade)

The frontend injects a long-lived gateway token and services run in a permissive auth
mode so the demo works without per-user login. For anything beyond a demo, restrict the
frontend (`SPARK_ALLOWED_IPS` or real auth), use Azure OpenAI EU, shorten token
lifetimes, and follow the operator responsibilities in the
[Security Notice](../README.md#security-notice).
