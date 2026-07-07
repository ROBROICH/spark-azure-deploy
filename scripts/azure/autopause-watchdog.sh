# Autopause watchdog for the SPARK demo — runs as a scheduled ACA Job (see infra/autopause-watchdog.bicep).
#
# Pauses the demo after >= IDLE_MINUTES with no frontend HTTP traffic: snapshots the four stateful
# stores (pg / qdrant / minio / spicedb) to the durable `snapshots` share, then scales EVERY container
# app to min-replicas 0. It is a NO-OP when the demo is already paused, when the frontend saw any
# request in the window, or when a Temporal workflow is running.
#
# Fail-safe by design: on ANY error or uncertainty it skips the pause and never scales down — so a
# transient Azure/metric/auth hiccup can never strand the demo or drop un-snapshotted state.
#
# Resume stays MANUAL: scripts/azure/resume-demo.ps1 (auto-resume is impossible with the snapshot /
# rehydrate model — the ephemeral stores come back empty and must be rehydrated before serving).
#
# All inputs arrive as environment variables set by the Job (see the bicep). POSIX sh; LF line endings.
set -u

RG="${RESOURCE_GROUP}"
FRONTEND_ID="${FRONTEND_RESOURCE_ID}"
FRONTEND="${FRONTEND_APP_NAME:-frontend}"
IDLE_MIN="${IDLE_MINUTES:-10}"
KV="${KEY_VAULT_NAME}"
TOKEN_SECRET="${GATEWAY_TOKEN_SECRET:-gateway-auth-token}"
SA="${SNAPSHOT_STORAGE_ACCOUNT}"
SHARE="${SNAPSHOT_SHARE:-snapshots}"
LOAD_URL="${TEMPORAL_LOAD_URL:-http://temporal-job/temporal/load}"
DRY_RUN="${DRY_RUN:-false}"
SPICEDB_BACKUP="spicedb-relationships.zedbackup"

log() { echo "[autopause $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# `containerapp` is an az extension; enable silent dynamic install for this ephemeral container.
export AZURE_EXTENSION_USE_DYNAMIC_INSTALL=yes_without_prompt

if [ -n "${MI_CLIENT_ID:-}" ]; then
  az login --identity --client-id "$MI_CLIENT_ID" --allow-no-subscriptions --output none 2>/tmp/le \
    || { log "FATAL: managed-identity login failed: $(tr '\n' ' ' < /tmp/le | cut -c1-320)"; exit 1; }
else
  az login --identity --allow-no-subscriptions --output none 2>/tmp/le \
    || { log "FATAL: managed-identity login failed: $(tr '\n' ' ' < /tmp/le | cut -c1-320)"; exit 1; }
fi
if [ -n "${SUBSCRIPTION_ID:-}" ]; then
  az account set --subscription "$SUBSCRIPTION_ID" --output none 2>/dev/null || true
fi
log "active-sub=$(az account show --query id -o tsv 2>/dev/null) sub_arg=${SUBSCRIPTION_ID:-none}"
az extension add --name containerapp --only-show-errors >/dev/null 2>&1 || true

# --- 0. already paused? (frontend at min-replicas 0) -------------------------------------------------
MIN=$(az containerapp show -n "$FRONTEND" -g "$RG" --query "properties.template.scale.minReplicas" -o tsv 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$MIN" ]; then log "could not read frontend scale - failing safe (skip)"; exit 0; fi
if [ "$MIN" = "0" ]; then log "frontend already paused (min-replicas 0) - nothing to do"; exit 0; fi

# --- 1. idle check — total frontend Requests over the last IDLE_MIN minutes --------------------------
START=$(python3 -c "import datetime;print((datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(minutes=$IDLE_MIN)).strftime('%Y-%m-%dT%H:%M:%SZ'))")
# PT1M grain (a supported grain — PT10M is not); sum the per-minute totals across the window.
if ! REQ_RAW=$(az monitor metrics list --resource "$FRONTEND_ID" --metric Requests --aggregation total \
      --start-time "$START" --interval PT1M \
      --query "value[0].timeseries[0].data[].total" -o tsv 2>/tmp/me); then
  log "metric query failed: $(tr '\n' ' ' < /tmp/me | cut -c1-320) - skip"; exit 0
fi
REQ=$(printf '%s\n' "$REQ_RAW" | python3 -c "import sys
try:
    print(int(sum(float(x) for x in sys.stdin if x.strip())))
except Exception:
    print(-1)")
REQ="${REQ:--1}"
log "frontend Requests in last ${IDLE_MIN}m = ${REQ}"
# Proceed only when the count is exactly 0; any positive count OR an unreadable value means "not idle".
if [ "$REQ" != "0" ]; then log "not idle or count unknown - skip"; exit 0; fi

# --- 2. workflow guard — skip if any Temporal workflow is running -----------------------------------
TOKEN=$(az keyvault secret show --vault-name "$KV" -n "$TOKEN_SECRET" --query value -o tsv 2>/dev/null)
if [ -z "$TOKEN" ]; then log "workflow guard: could not read token - failing safe (skip)"; exit 0; fi
RUNNING=$(python3 - "$LOAD_URL" "$TOKEN" <<'PYEOF' 2>/dev/null
import sys, json, urllib.request
url, token = sys.argv[1], sys.argv[2]
try:
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(req, timeout=20) as r:
        print(int(json.load(r).get("running_workflows", -1)))
except Exception:
    print(-1)
PYEOF
)
RUNNING="${RUNNING:--1}"
log "running_workflows = ${RUNNING}"
if [ "$RUNNING" != "0" ]; then log "workflow running or status unknown - failing safe (skip)"; exit 0; fi

log "DECISION: idle >= ${IDLE_MIN}m and no running workflows -> PAUSE"
if [ "$DRY_RUN" = "true" ]; then log "DRY_RUN=true - would snapshot + scale all apps to 0; taking NO action"; exit 0; fi

# --- 3. snapshot the four stores (they are running; capture BEFORE scaling to zero) -----------------
KEY=$(az storage account keys list -g "$RG" -n "$SA" --query "[0].value" -o tsv 2>/dev/null)
if [ -z "$KEY" ]; then log "ABORT: cannot read storage key for $SA - not pausing"; exit 1; fi
# spicedb: pre-clean stale backup + lock so a fresh, non-empty file proves THIS run produced it.
az storage file delete --account-name "$SA" --account-key "$KEY" --share-name "$SHARE" --path "$SPICEDB_BACKUP" --output none 2>/dev/null || true
az storage file delete --account-name "$SA" --account-key "$KEY" --share-name "$SHARE" --path "${SPICEDB_BACKUP}.lock" --output none 2>/dev/null || true
for j in pg-snapshot qdrant-snapshot minio-snapshot spicedb-snapshot; do
  log "trigger $j"
  az containerapp job start -n "$j" -g "$RG" --output none 2>/dev/null || log "WARN: could not start $j"
done

wait_terminal() {  # $1 = job name; echoes the final execution status (or Timeout)
  n=0
  while [ "$n" -lt 120 ]; do
    s=$(az containerapp job execution list -n "$1" -g "$RG" --query "[0].properties.status" -o tsv 2>/dev/null)
    case "$s" in
      Succeeded | Failed | Cancelled | Degraded) echo "$s"; return 0 ;;
    esac
    n=$((n + 1)); sleep 5
  done
  echo "Timeout"
}

FAILED=""
for j in pg-snapshot qdrant-snapshot minio-snapshot; do
  st=$(wait_terminal "$j"); log "$j => $st"
  [ "$st" = "Succeeded" ] || FAILED="$FAILED $j"
done
# spicedb: `zed backup create` on Azure Files exits non-zero even when the backup is valid, so verify
# success by the freshly-written (pre-cleaned) non-empty backup file instead of the job status.
sst=$(wait_terminal spicedb-snapshot)
SZ=$(az storage file show --account-name "$SA" --account-key "$KEY" --share-name "$SHARE" --path "$SPICEDB_BACKUP" --query "properties.contentLength" -o tsv 2>/dev/null)
SZ="${SZ:-0}"
if [ "$SZ" -gt 0 ] 2>/dev/null; then
  log "spicedb-snapshot => $sst, backup present (${SZ} bytes) -> OK"
else
  log "spicedb-snapshot => $sst, NO backup file"; FAILED="$FAILED spicedb-snapshot"
fi

if [ -n "$FAILED" ]; then log "ABORT: snapshot(s) failed:$FAILED - NOT scaling down (data safety)"; exit 1; fi
log "all four snapshots captured"

# --- 4. scale every container app to min-replicas 0 (idle to ~EUR0 within the ACA cooldown) ---------
COUNT=0
for a in $(az containerapp list -g "$RG" --query "[].name" -o tsv 2>/dev/null); do
  if az containerapp update -n "$a" -g "$RG" --min-replicas 0 --max-replicas 1 --output none 2>/dev/null; then
    COUNT=$((COUNT + 1))
  else
    log "WARN: failed to scale $a"
  fi
done
log "AUTOPAUSE COMPLETE — snapshots captured, scaled ${COUNT} apps to min-replicas 0. Resume with resume-demo.ps1."
