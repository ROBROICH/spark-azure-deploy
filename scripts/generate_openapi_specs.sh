#!/usr/bin/env bash
# Generate the deployable TypeScript API specification and documentation images.

set -euo pipefail
USE_EXISTING_ENV=false
KEEP_ARTIFACTS=false
while getopts "ek" option; do
  case "$option" in
    e) USE_EXISTING_ENV=true ;;
    k) KEEP_ARTIFACTS=true ;;
    *) exit 2 ;;
  esac
done
shift "$((OPTIND - 1))"
if [[ $# -ne 0 ]]; then
  echo "Usage: $0 [-e] [-k]" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPECS_DIR="$REPO_ROOT/02-backend/service_api_docs/specs"
DOCKERFILE="$REPO_ROOT/02-backend/service_api_docs/Dockerfile"

apply_dummy_env() {
  local dummy="dummy_unused_just_for_openapi_generation"
  local url="http://127.0.0.1:1"
  local uuid="00000000-0000-0000-0000-000000000000"

  export HOST=127.0.0.1 PORT=1 ENV=local AUTH_MODE=disabled ACTIVE_FEATURE_WORKER=none
  export DB_HOST=127.0.0.1 DB_PORT=1 DB_NAME="$dummy" DB_USER="$dummy" DB_PASSWORD="$dummy"
  export DB_MIGRATE_HOST=127.0.0.1 DB_MIGRATE_USER="$dummy" DB_MIGRATE_PASSWORD="$dummy"
  export LAW_DATABASE_BASE_URL="$url"
  export AGENT_ORCHESTRATION_SERVICE_URL="$url"
  export FC_SERVICE_URL="$url"
  export PLAUSIBILITY_SERVICE_URL="$url"
  export JOB_SERVICE_URL="$url"
  export AUTH_BASE_URL="$url"
  export AUTH_REALM="$dummy"
  export AUTH_CLIENT_ID="$dummy"
  export AUTH_CLIENT_SECRET="$dummy"
  export AUTH_SPICE_DB_ENDPOINT="127.0.0.1:1"
  export AUTH_SPICE_DB_TOKEN="$dummy"
  export AUTH_SPICE_DB_INSECURE=true
  export AUTH_SPICE_DB_BULK_CHUNK_SIZE=1
  export CLAMAV_ENABLED=false
  export CLAMAV_BASE_URL="$url"
  export BUCKET_NAME="$dummy"
  export S3_ACCESS_KEY_ID="$dummy"
  export S3_SECRET_ACCESS_KEY="$dummy"
  export S3_ENDPOINT_URL="$url"
  export S3_EXTERNAL_URL="$url"
  export S3_REGION="$dummy"
  export TEMPORAL_HOST="127.0.0.1:1"
  export TEMPORAL_NAMESPACE="$dummy"
  export TEMPORAL_ENABLE_APPROVAL=false
  export TEMPORAL_MAX_CONCURRENT_ACTIVITIES=1
  export CHECKPOINT_RETENTION_PERIOD_DAYS=1
  export MAX_ZIP_ENTRIES=1
  export MAX_SINGLE_ENTRY_SIZE_MB=1
  export MAX_ZIP_EXTRACTION_SIZE_GB=1
  export MAX_COMPRESSION_RATIO=1
  export MAX_ZIP_APPENDED_DATA_BYTES=65536
  export MAX_OBJECT_SIZE_MB=1
  export DEFAULT_PROJECT_TYPE_ID="$uuid"
  export SYSTEM_USER_ID="$uuid"
  export FPP_ALLOWED_DOMAINS=""
  export FPP_BLOCK_PRIVATE_IPS=false
  export UNO_HOST=127.0.0.1
  export UNO_PORT=1
  export UNO_PROTOCOL=http
  export UNO_TIMEOUT_MS=1
  export UNO_PREFLIGHT_TIMEOUT_MS=1
  export PROJECT_LOGIC_SERVICE_CORS_ORIGINS=""
  export ARCHIVAL_ENABLED=false
  export ARCHIVAL_WORKFLOW_ID="$dummy"
  export ARCHIVAL_CRON="* * * * *"
  export ARCHIVAL_BATCH_SIZE=1
  export ARCHIVAL_S3_PREFIX="$dummy"
  export MAX_SYSTEM_COMPLEXITY=1
  export WORKFLOW_COMPLEXITY="{}"
  export DEFAULT_WORKFLOW_COMPLEXITY_WEIGHT=0
  export EXTERNAL_SERVICE_TIMEOUT_MS=1
}

read_openapi_title() {
  local current_spec="$1"
  local fallback="$2"

  bun --eval '
    const path = Bun.argv[1];
    const fallback = Bun.argv[2];
    try {
      const document = await Bun.file(path).json();
      const title = document.info?.title;
      const stem = path.split("/").at(-1)?.replace(/\.json$/, "") ?? "";
      if (title && title !== stem && title !== stem.replaceAll("-", "_")) {
        console.log(title);
        process.exit(0);
      }
    } catch {}
    console.log(fallback);
  ' "$current_spec" "$fallback"
}

FAILED=()
SWAGGER_URLS="["
SCALAR_SOURCES="["
SERVICE_DIRS=()
SERVICE_NAMES=()
SERVICE_SPECS=()
SERVICE_SWAGGER_NAMES=()

for svc_dir in "$REPO_ROOT"/02-backend/apps/spark-backend/; do
  [[ -f "$svc_dir/src/index.ts" && -f "$svc_dir/package.json" ]] || continue

  name=$(basename "$svc_dir")
  spec="${name//_/-}"
  if [[ "$name" == "spark-backend" ]]; then
    swagger_name="SPARK Workflow"
  else
    swagger_name=$(read_openapi_title "$SPECS_DIR/$spec.json" "$spec")
  fi

  SERVICE_DIRS+=("$svc_dir")
  SERVICE_NAMES+=("$name")
  SERVICE_SPECS+=("$spec")
  SERVICE_SWAGGER_NAMES+=("$swagger_name")
done

if [[ ${#SERVICE_DIRS[@]} -eq 0 ]]; then
  echo "No TypeScript http-host apps found under 02-backend/apps"
  exit 1
fi

GENERATED_DIR="$(mktemp -d "${TMPDIR:-/tmp}/openapi-specs.XXXXXX")"
if [[ "$KEEP_ARTIFACTS" == true ]]; then
  echo "Retained generation artifacts: $GENERATED_DIR"
else
  trap 'rm -rf "$GENERATED_DIR"' EXIT
fi
if [[ "$USE_EXISTING_ENV" == false ]]; then
  apply_dummy_env
fi

for i in "${!SERVICE_DIRS[@]}"; do
  svc_dir="${SERVICE_DIRS[$i]}"
  name="${SERVICE_NAMES[$i]}"
  spec="${SERVICE_SPECS[$i]}"
  swagger_name="${SERVICE_SWAGGER_NAMES[$i]}"
  out="$GENERATED_DIR/$spec.json"
  if (
    cd "$svc_dir" &&
      OPENAPI_TITLE="$swagger_name" bun --eval '
        const module = await import("./src/index.ts");
        const configured =
          typeof module.createApplication === "function"
            ? await module.createApplication()
            : module;
        const { app } = configured;
        if (app === undefined || typeof app.handle !== "function") {
          throw new Error("src/index.ts must export app or createApplication()");
        }
        try {
          const response = await app.handle(new Request("http://localhost/openapi.json"));
          if (!response.ok) {
            throw new Error(`/openapi.json returned ${response.status}`);
          }
          const document = await response.json();
          const title = process.env.OPENAPI_TITLE;
          if (title) document.info = { ...document.info, title };
          const schemas = document.components?.schemas ?? {};
          const visit = (value) => {
            if (Array.isArray(value)) {
              for (const item of value) visit(item);
              return;
            }
            if (value === null || typeof value !== "object") return;
            if (value.$defs !== undefined) {
              throw new Error("OpenAPI document contains inline schema definitions");
            }
            if (typeof value.$ref === "string") {
              const prefix = "#/components/schemas/";
              if (!value.$ref.startsWith(prefix)) {
                throw new Error(`OpenAPI schema reference is not local: ${value.$ref}`);
              }
              const name = value.$ref.slice(prefix.length);
              if (!Object.hasOwn(schemas, name)) {
                throw new Error(`OpenAPI schema reference does not resolve: ${value.$ref}`);
              }
            }
            for (const item of Object.values(value)) visit(item);
          };
          visit(document);
          await Bun.write(Bun.stdout, `${JSON.stringify(document, null, 2)}\n`);
        } finally {
          if (configured !== module && typeof configured.stop === "function") {
            await configured.stop();
          }
        }
      '
  ) >"$out"; then
    echo "OK    $spec.json"
    SWAGGER_URLS="$SWAGGER_URLS{\"url\":\"./specs/$spec.json\",\"name\":\"$swagger_name\"},"
    SCALAR_SOURCES="$SCALAR_SOURCES{\"url\":\"/docs/$spec.json\",\"title\":\"$swagger_name\",\"slug\":\"$spec\"},"
  else
    echo "FAIL  $spec.json"
    FAILED+=("$name")
  fi
done

SWAGGER_URLS="${SWAGGER_URLS%,}]"
SCALAR_SOURCES="${SCALAR_SOURCES%,}]"

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Failed: ${FAILED[*]}"
  exit 1
fi

if [[ "$KEEP_ARTIFACTS" == true ]]; then
  for current_spec in "$SPECS_DIR"/*.json; do
    if [[ -f "$current_spec" && ! -f "$GENERATED_DIR/${current_spec##*/}" ]]; then
      echo "Obsolete specification remains; refusing to retain it: $current_spec" >&2
      exit 1
    fi
  done
else
  rm -rf "$SPECS_DIR"
fi
mkdir -p "$SPECS_DIR"
cp "$GENERATED_DIR"/*.json "$SPECS_DIR/"

cat > "$DOCKERFILE" << DEOF
# Generated by: scripts/generate_openapi_specs.sh
FROM swaggerapi/swagger-ui:v5.32.1

RUN apk upgrade --no-cache

COPY 02-backend/service_api_docs/specs/ /usr/share/nginx/html/specs/

ENV URLS='$SWAGGER_URLS'
ENV BASE_URL=/
DEOF

cat > "$REPO_ROOT/02-backend/service_api_docs/Dockerfile.scalar" << DEOF
# Generated by: scripts/generate_openapi_specs.sh
FROM scalarapi/api-reference:0.5.47

USER root
RUN apk upgrade --no-cache
USER caddy

COPY 02-backend/service_api_docs/specs/ /docs/

ENV API_REFERENCE_CONFIG='{"sources":$SCALAR_SOURCES,"theme":"default","agent":{"disabled":true},"customCss":".open-api-client-button,.scalar-mcp-layer,a[href*=\"scalar.com\"],a[href*=\"scalar.com\"]::before,a[href*=\"scalar.com\"]::after{display:none !important}"}'
DEOF

echo ""
echo "Updated Dockerfile and Dockerfile.scalar"
