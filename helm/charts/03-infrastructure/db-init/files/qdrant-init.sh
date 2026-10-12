#!/usr/bin/env bash
# qdrant-init — drop / restore one Qdrant collection.
#
# Environment (set by templates/qdrant-jobs.yaml):
#   QDRANT_URL       Qdrant HTTP endpoint (e.g. http://qdrant.<ns>.svc:6333)
#   QDRANT_API_KEY   optional API key
#   COLLECTION       collection to act on
#   DROP             true: delete the collection first
#   SNAPSHOT_FILE    snapshot to restore ('' = none); refused when the
#                    collection exists and DROP is not true (like a database
#                    restore on top of existing tables)
#   ACTION_ID        identity of the request (hash of drop, snapshot location,
#                    run id), recorded as the alias <collection>--db-init-<id>
#                    after success; an identical request is skipped.
set -euo pipefail

log() { printf '[qdrant-init %s] %s\n' "$COLLECTION" "$*"; }
die() { log "ERROR: $*"; exit 1; }
auth=()
[ -z "${QDRANT_API_KEY:-}" ] || auth=(-H "api-key: $QDRANT_API_KEY")
api() {  # method path [curl args…] -> body on stdout, fails on HTTP >= 400
  local method=$1 path=$2; shift 2
  curl -fsS --retry 3 --retry-connrefused -X "$method" "${auth[@]}" "$QDRANT_URL$path" "$@"
}
marker="$COLLECTION--db-init-$ACTION_ID"

for i in $(seq 1 30); do
  api GET /readyz >/dev/null 2>&1 && break
  [ "$i" -lt 30 ] || die "Qdrant at $QDRANT_URL not ready"
  sleep 5
done

exists=$(api GET /collections/"$COLLECTION"/exists | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["exists"])')
if [ "$exists" = True ] && api GET /collections/"$COLLECTION"/aliases |
     python3 -c 'import json,sys; m=sys.argv[1]; sys.exit(0 if any(a["alias_name"]==m for a in json.load(sys.stdin)["result"]["aliases"]) else 1)' "$marker"; then
  log "request $ACTION_ID already applied — nothing to do (change runId to repeat it)"
  exit 0
fi

if [ "${DROP:-false}" = true ] && [ "$exists" = True ]; then
  log "deleting collection"
  api DELETE "/collections/$COLLECTION?wait=true" >/dev/null
  exists=False
fi

if [ -n "${SNAPSHOT_FILE:-}" ]; then
  [ "$exists" != True ] || die "collection exists — refusing to restore over it (set drop: database to replace it)"
  [ -s "$SNAPSHOT_FILE" ] || die "snapshot $SNAPSHOT_FILE is missing or empty"
  log "restoring snapshot ($(stat -c %s "$SNAPSHOT_FILE") bytes)"
  api POST "/collections/$COLLECTION/snapshots/upload?priority=snapshot&wait=true" \
    -F "snapshot=@$SNAPSHOT_FILE" >/dev/null
fi

if [ "$(api GET /collections/"$COLLECTION"/exists | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["exists"])')" = True ]; then
  # drop older markers of this collection, then record this request
  actions=$(api GET /collections/"$COLLECTION"/aliases | python3 -c '
import json, sys
c, m = sys.argv[1], sys.argv[2]
acts = [{"delete_alias": {"alias_name": a["alias_name"]}} for a in json.load(sys.stdin)["result"]["aliases"]
        if a["alias_name"].startswith(c + "--db-init-")]
acts.append({"create_alias": {"collection_name": c, "alias_name": m}})
print(json.dumps({"actions": acts}))' "$COLLECTION" "$marker")
  api POST "/collections/aliases?wait=true" -H 'Content-Type: application/json' -d "$actions" >/dev/null
  points=$(api POST /collections/"$COLLECTION"/points/count -H 'Content-Type: application/json' -d '{"exact":true}' |
           python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["count"])')
  log "done ($points points)"
else
  log "done (collection absent — the writer modules create it lazily)"
fi
