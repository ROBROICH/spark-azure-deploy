#!/usr/bin/env python
"""Generate infra/app-env.json for the ACA app tier.

For each deployed service we need the UNION of its per-service .env.local (which the
container image does NOT ship, because .dockerignore excludes it and SKIP_DOTENV=true)
and the process-compose environment (which overrides .env.local and fixes stale URLs).
All localhost:PORT references are rewritten to ACA internal DNS. Secrets become secretRef.
Output: { "<aca-app-name>": [ {name,value} | {name,secretRef}, ... ], ... }
"""
import json
import os
import pathlib
import re

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
pc = yaml.safe_load((ROOT / "process-compose.yaml").read_text(encoding="utf-8"))
procs = pc["processes"]
global_env_list = pc.get("environment", [])

# ---------------------------------------------------------------------------
# LLM / embedding configuration - deploy-time overridable via SPARK_* env vars.
# The demo talks to an OpenAI-COMPATIBLE endpoint, so the same knobs target
# either OpenAI (https://api.openai.com/v1) or Azure OpenAI
# (https://<resource>.openai.azure.com/openai/v1/). The customer picks the
# endpoint + chat model at deploy time; the defaults below preserve the OpenAI
# demo. The API key is NOT set here - it flows through Key Vault as the
# ``openai-api-key`` secret.
#
# The EMBEDDING model is effectively PINNED for the seeded demo: the golden
# snapshot's vectors were produced with text-embedding-3-small (the legal
# pgvector DBs at 1024 dims, the Qdrant extraction collection at the native
# 1536). Changing SPARK_EMBEDDING_MODEL requires re-seeding and re-provisioning
# both vector stores, so leave it at the default unless rebuilding the corpus.
# ---------------------------------------------------------------------------
LLM_BASE_URL = os.environ.get("SPARK_LLM_BASE_URL", "https://api.openai.com/v1")
LLM_TEXT_MODEL = os.environ.get("SPARK_TEXT_MODEL", "gpt-5.4-mini")
LLM_EMBEDDING_MODEL = os.environ.get("SPARK_EMBEDDING_MODEL", "text-embedding-3-small")

# dev service port -> ACA app (HTTP ingress; reachable at http://<app> on port 80)
PORT2APP = {
    "18000": "project-logic", "18001": "document-management", "18002": "formal-completeness",
    "18003": "agent-orchestration", "18004": "diplan", "18005": "plausibility-notes",
    "18006": "objections-management", "18007": "fpp", "18008": "comment", "18009": "examination",
    "18010": "administrative-file-draft", "18011": "feedback", "18012": "supplementary-requests",
    "18013": "identity-management", "18015": "temporal-job", "18016": "protocol",
    "18020": "gesetze-normen-db", "18021": "gesetzesbegruendung-db", "18022": "jura-db",
    "18024": "rechtsaenderungs-monitoring",
}
# infra services keep host:port over TCP ingress
INFRA = {
    "7233": "temporal:7233", "5432": "postgresql:5432", "9000": "minio:9000",
    "6333": "qdrant:6333", "50051": "spicedb:50051", "9090": "keycloak:8080", "8080": "keycloak:8080",
}

SECRET_RULES = [
    (re.compile(r"DB_PASSWORD$"), "db-password"),
    (re.compile(r"S3_ACCESS_KEY_ID$"), "s3-access-key"),
    (re.compile(r"S3_SECRET_ACCESS_KEY$"), "s3-secret-key"),
    (re.compile(r"SPICE_DB_TOKEN$"), "spicedb-token"),
    (re.compile(r"(AUTH_CLIENT_SECRET|AUTH_PRIVILEGED_CLIENT_SECRET|KEYCLOAK_CLIENT_SECRET)$"), "keycloak-client-secret"),
    (re.compile(r"(LITELLM_MASTER_KEY|CHUNKING_APIKEY)$"), "openai-api-key"),
]

VALUE_SECRET_REFS = {
    "${DB_PASSWORD}": "db-password",
    "${S3_ACCESS_KEY_ID}": "s3-access-key",
    "${S3_SECRET_ACCESS_KEY}": "s3-secret-key",
    "${AUTH_SPICE_DB_TOKEN}": "spicedb-token",
    "${LITELLM_MASTER_KEY}": "openai-api-key",
    "${LOCAL_KEYCLOAK_CLIENT_SECRET}": "keycloak-client-secret",
}

VAR_EXPAND = {
    "${LITELLM_BASE_URL}": LLM_BASE_URL,
    "${LITELLM_TEXT_MODEL}": LLM_TEXT_MODEL,
    "${LITELLM_EMBEDDING_MODEL}": LLM_EMBEDDING_MODEL,
}

DEPLOY = [
    "project-logic", "document-management", "formal-completeness", "agent-orchestration",
    "plausibility-notes", "objections-management", "fpp", "comment", "examination",
    "administrative-file-draft", "feedback", "supplementary-requests", "temporal-job", "protocol",
    "gesetze-normen-db", "gesetzesbegruendung-db", "jura-db", "identity-management",
    "llm-client", "worker-formale-pruefung", "worker-risikohinweiser", "worker-inhaltsextraktion",
    "worker-rechtsmethodik", "worker-bewertung", "worker-einwendungsmanagement",
    "worker-suche-und-zuordnung", "worker-plausibilitaet-pruefung", "worker-anonymisierung",
]


def parse_env_list(lst):
    out = {}
    for item in lst or []:
        if "=" in item:
            k, v = item.split("=", 1)
            out[k.strip()] = v
    return out


def parse_env_local(path):
    out = {}
    if not path.exists():
        return out
    lines = path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if not s or s.startswith("#") or "=" not in line:
            i += 1
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        if v[:1] in ("'", '"'):
            q = v[0]
            if not v.rstrip().endswith(q) or len(v.rstrip()) == 1:
                buf = [v]
                i += 1
                while i < len(lines):
                    buf.append(lines[i])
                    if lines[i].rstrip().endswith(q):
                        break
                    i += 1
                v = "\n".join(buf)
            v = v.strip().strip(q)
        else:
            v = v.strip()
            v = re.sub(r"\s+#.*$", "", v).strip()  # strip inline "  # comment"
        out[k] = v
        i += 1
    return out


def translate(v):
    if not isinstance(v, str):
        return v

    def url_repl(m):
        port, rest = m.group(1), m.group(2) or ""
        if port in PORT2APP:
            return "http://" + PORT2APP[port] + rest
        if port in INFRA:
            return "http://" + INFRA[port] + rest
        return m.group(0)

    v = re.sub(r"http://localhost:(\d+)(/[^\s\"']*)?", url_repl, v)

    def bare_repl(m):
        port = m.group(1)
        if port in INFRA:
            return INFRA[port]
        if port in PORT2APP:
            return PORT2APP[port]
        return m.group(0)

    v = re.sub(r"\blocalhost:(\d+)\b", bare_repl, v)
    for a, b in VAR_EXPAND.items():
        v = v.replace(a, b)
    return v


def secret_for(key, raw_value):
    for rx, ref in SECRET_RULES:
        if rx.search(key):
            return ref
    for token, ref in VALUE_SECRET_REFS.items():
        if token in raw_value:
            return ref
    return None


gvars = parse_env_list(global_env_list)
result = {}
for name in DEPLOY:
    proc = procs.get(name, {})
    wd = proc.get("working_dir", "").lstrip("./")
    merged = {}
    merged.update(parse_env_local(ROOT / wd / ".env.local") if wd else {})
    merged.update(gvars)                                  # process-compose global overrides
    merged.update(parse_env_list(proc.get("environment")))  # per-process wins
    # Real-token auth (lighter mode): the gateway injects a signed Keycloak token; backends
    # validate it and log the result but never hard-reject, so tokenless inter-service calls
    # and the unowned migrated Umgehung project keep working.
    merged["AUTH_MODE"] = "optional_verify_dry_run"
    merged["AUTH_BASE_URL"] = "http://keycloak:8080"
    merged["AUTH_REALM"] = "local"
    merged["AUTH_AUDIENCE"] = "local-client"
    merged["AUTH_JWKS_URL"] = "http://keycloak:8080/realms/local/protocol/openid-connect/certs"
    merged["AUTH_CLIENT_ID"] = "local-client"
    merged["AUTH_CLIENT_SECRET"] = "${LOCAL_KEYCLOAK_CLIENT_SECRET}"
    # Presigned upload/download URLs must be reachable from the browser: point them at the
    # public MinIO reverse proxy (internal S3 ops still use the internal S3_ENDPOINT_URL).
    # Overridable via SPARK_S3_EXTERNAL_URL so a clone/QA env can use its own ACA domain.
    merged["S3_EXTERNAL_URL"] = os.environ.get(
        "SPARK_S3_EXTERNAL_URL",
        "https://minio-public.example.invalid",
    )
    merged["OTEL_SDK_DISABLED"] = "true"

    arr = []
    for k, raw in merged.items():
        if k in ("DB_HOST", "DB__HOST", "LEGAL_DEFINITION_POSTGRES_HOST") and raw.strip() == "localhost":
            raw = "postgresql"
        ref = secret_for(k, raw)
        if ref:
            arr.append({"name": k, "secretRef": ref})
            continue
        val = translate(raw)
        if val.startswith("${") or val.startswith("<"):
            continue  # unresolved placeholder -> skip
        arr.append({"name": k, "value": val})
    # SpiceDB settings are REQUIRED by AuthSettings whenever auth mode is not "disabled"
    # (we run optional_verify_dry_run). Every service must have endpoint + token + insecure flag
    # even if it never runs permission checks, or auth_settings() validation 500s all its requests.
    names_now = {e["name"] for e in arr}
    if "AUTH_SPICE_DB_ENDPOINT" not in names_now:
        arr.append({"name": "AUTH_SPICE_DB_ENDPOINT", "value": "spicedb:50051"})
    if "AUTH_SPICE_DB_INSECURE" not in names_now:
        arr.append({"name": "AUTH_SPICE_DB_INSECURE", "value": "true"})
    if "AUTH_SPICE_DB_TOKEN" not in names_now:
        arr.append({"name": "AUTH_SPICE_DB_TOKEN", "secretRef": "spicedb-token"})
    # Root .env secrets process-compose injects into every process (DMS etc. read plain S3_* keys)
    for gk, gref in (("S3_ACCESS_KEY_ID", "s3-access-key"), ("S3_SECRET_ACCESS_KEY", "s3-secret-key")):
        if gk not in names_now:
            arr.append({"name": gk, "secretRef": gref})
    # LiteLLM config (root .env) is global in dev; several workers read it directly
    for gk, gval in (
        ("LITELLM_BASE_URL", LLM_BASE_URL),
        ("LITELLM_TEXT_MODEL", LLM_TEXT_MODEL),
        ("LITELLM_EMBEDDING_MODEL", LLM_EMBEDDING_MODEL),
    ):
        if gk not in names_now:
            arr.append({"name": gk, "value": gval})
    if "LITELLM_MASTER_KEY" not in names_now:
        arr.append({"name": "LITELLM_MASTER_KEY", "secretRef": "openai-api-key"})
    # Injection scanning is disabled in the demo; token is unused but required by validation
    if "INJECTION_MODEL_TOKEN" not in names_now:
        arr.append({"name": "INJECTION_MODEL_TOKEN", "value": "disabled"})
    result[name] = arr

# Ensure llm-client has explicit LiteLLM config (its .env.local leaves them commented)
have = {e["name"] for e in result["llm-client"]}
for k, e in [
    ("LITELLM_BASE_URL", {"name": "LITELLM_BASE_URL", "value": LLM_BASE_URL}),
    ("LITELLM_TEXT_MODEL", {"name": "LITELLM_TEXT_MODEL", "value": LLM_TEXT_MODEL}),
    ("LITELLM_EMBEDDING_MODEL", {"name": "LITELLM_EMBEDDING_MODEL", "value": LLM_EMBEDDING_MODEL}),
    ("LITELLM_MASTER_KEY", {"name": "LITELLM_MASTER_KEY", "secretRef": "openai-api-key"}),
]:
    if k not in have:
        result["llm-client"].append(e)

(ROOT / "infra" / "app-env.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(f"wrote infra/app-env.json with {len(result)} services")
for n in DEPLOY:
    print(f"  {n}: {len(result[n])} vars")
