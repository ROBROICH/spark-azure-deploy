#!/usr/bin/env bash
# Functional test of files/db-init.sh and the rendered Jobs against a real
# PostgreSQL 16 with pgvector, SpiceDB and Qdrant.
# The admin is a non-superuser with CREATEDB/CREATEROLE that created the
# owner role — like the admin of a managed server (CloudSQL). Cases:
#   1 create a missing database (owner set)
#   2 restore a pg_dump custom archive into it (objects owned by the owner)
#   3 restore again without drop → refused (database not empty)
#   4 drop: tables + restore a gzipped plain dump
#   5 drop: database + restore a custom archive
#   6 missing database with create=false → fails
#   7 missing owner role → fails
#   8 an identical request (ACTION_ID) acts once
#   9 a new request id repeats it
#  10 pgvector columns/indexes restored (extension created as admin); the
#     application role can connect again (CONNECT re-granted after isolation)
#  10a extensions listed for a database are created by the admin
#  10b a plain dump that resets the role is refused before anything runs
#  10c a custom archive containing a role switch is refused
#  R1-R3 create / restore as the restricted Pod Security user (uid 65532,
#     no capabilities, no privilege escalation, HOME=/tmp)
#  11 the rendered SpiceDB restore Job (its containers, in order) restores
#  12 an identical SpiceDB request acts once
#  13 the rendered Qdrant Job restores a snapshot (Qdrant v1.17.1)
#  14 an identical Qdrant request acts once
#  14b a Qdrant restore over an existing collection needs drop (refused)
#  15 drop + restore with a new run id
#  16 the rendered teardown Job drops the listed databases and collections
#     and nothing else
#
# The test runs inside a pod-like environment: the servers are reachable on
# localhost and the test container (postgres:16-bookworm + test/pod-tools.sh)
# runs db-init.sh and the commands of the rendered Jobs' containers itself —
# no container runtime needed, so it also runs as a CI job with the servers
# as job services (DB_INIT_TEST_POD=1).
# Locally (DB_INIT_TEST_POD unset) the script builds that pod with docker:
# the servers and the test container share one network namespace.
# Run: charts/03-infrastructure/db-init/test/db-init-test.sh
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
CHART=$(cd "$HERE/.." && pwd)
SERVER_IMAGE=${DB_INIT_TEST_SERVER_IMAGE:-pgvector/pgvector:pg16}   # server with pgvector
CLIENT_IMAGE=${DB_INIT_TEST_IMAGE:-postgres:16-bookworm}            # the Jobs' client image
SPICEDB_IMAGE=authzed/spicedb:v1.51.0
QDRANT_IMAGE=qdrant/qdrant:v1.17.1
# CloudSQL lets its admin (cloudsqlsuperuser) create pgvector; vanilla
# PostgreSQL only lets superusers — mark it trusted to emulate that. The same
# entrypoint as the CI service.
PG_ENTRYPOINT='echo "trusted = true" >> "$(pg_config --sharedir)/extension/vector.control" && exec docker-entrypoint.sh postgres'

# --- local: build the pod with docker ------------------------------------------
if [ "${DB_INIT_TEST_POD:-}" != 1 ]; then
  command -v docker >/dev/null || { echo "docker not available (or set DB_INIT_TEST_POD=1 inside a prepared pod)"; exit 2; }
  ID=db-init-test-$$
  trap 'docker rm -f "$ID-pg" "$ID-spicedb" "$ID-qdrant" >/dev/null 2>&1' EXIT
  REPO=$(cd "$CHART/../../.." && pwd)
  docker run -d --name "$ID-pg" -e POSTGRES_PASSWORD=root --entrypoint sh "$SERVER_IMAGE" -c "$PG_ENTRYPOINT" >/dev/null
  docker run -d --name "$ID-spicedb" --network "container:$ID-pg" "$SPICEDB_IMAGE" \
    serve --grpc-preshared-key key --datastore-engine memory >/dev/null
  docker run -d --name "$ID-qdrant" --network "container:$ID-pg" "$QDRANT_IMAGE" >/dev/null
  docker run --rm --network "container:$ID-pg" -v "$REPO:/repo:ro" -w /repo -e DB_INIT_TEST_POD=1 "$CLIENT_IMAGE" \
    bash -c 'charts/03-infrastructure/db-init/test/pod-tools.sh >/dev/null && charts/03-infrastructure/db-init/test/db-init-test.sh'
  exit $?
fi

# --- inside the pod ------------------------------------------------------------
SCRIPT="$CHART/files/db-init.sh"
WORK=$(mktemp -d)
chmod 755 "$WORK"   # readable by the restricted user
FAILS=0
pass() { printf 'PASS: %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*"; FAILS=$((FAILS + 1)); }
trap 'rm -rf "$WORK" /work' EXIT
for t in psql pg_dump pg_restore python3 curl helm zed; do
  command -v "$t" >/dev/null || { echo "$t missing — run test/pod-tools.sh first"; exit 2; }
done

su() { PGPASSWORD=root psql -X -v ON_ERROR_STOP=1 -q -h localhost -U postgres "$@"; }
q() { su -tA -d "$1" -c "$2"; }
zedc() { ZED_ENDPOINT=localhost:50051 ZED_TOKEN=key ZED_INSECURE=true zed "$@"; }
QD=http://localhost:6333
qd() { curl -fsS "$@"; }

for _ in $(seq 1 60); do pg_isready -q -h localhost -U postgres && su -c 'SELECT 1' >/dev/null 2>&1 && break; sleep 2; done
for _ in $(seq 1 60); do qd "$QD/readyz" >/dev/null 2>&1 && break; sleep 2; done
for _ in $(seq 1 60); do zedc schema read >/dev/null 2>&1 && break; zedc schema read 2>&1 | grep -q 'No schema' && break; sleep 2; done

su -c "CREATE ROLE dbadmin LOGIN PASSWORD 'admin' CREATEDB CREATEROLE"
PGPASSWORD=admin psql -X -q -h localhost -U dbadmin -d postgres -c "CREATE ROLE appuser LOGIN PASSWORD 'app'"

# source data + dumps (as a foreign owner, like a dump from another stage)
su -c "CREATE ROLE produser" -c "CREATE DATABASE src OWNER produser"
su -d src -c "CREATE EXTENSION vector"
su -d src -c "SET ROLE produser; CREATE TABLE t1(id int primary key, v text, e vector(3)); INSERT INTO t1 VALUES (1,'a','[1,2,3]'),(2,'b','[4,5,6]');
              CREATE INDEX ON t1 USING hnsw (e vector_l2_ops);
              CREATE SCHEMA extra; CREATE TABLE extra.t2(id int); GRANT SELECT ON t1 TO PUBLIC;"
PGPASSWORD=root pg_dump -h localhost -U postgres -Fc src > "$WORK/custom.dump"
PGPASSWORD=root pg_dump -h localhost -U postgres --no-owner --no-privileges src | gzip > "$WORK/plain.sql.gz"

# db-init.sh with the Job's environment; $USER_PREFIX runs it as another user
dbinit() {  # name create drop dump
  rm -f /tmp/toc /tmp/toc.restore   # the script's scratch files, possibly left by another user
  chmod 644 "$WORK"/*.dump "$WORK"/*.gz 2>/dev/null || true
  ${USER_PREFIX:-} env -i PATH="$PATH" HOME=/tmp \
    PGHOST=localhost PGPORT=5432 PGSSLMODE=disable PGUSER=dbadmin PGPASSWORD=admin \
    DB_NAME="$1" DB_OWNER="${OWNER:-appuser}" CREATE_MISSING="$2" DROP_MODE="$3" \
    DUMP_FILE="${4:+$WORK/$4}" ACTION_ID="${ACTION_ID:-}" EXTENSIONS="${EXTENSIONS:-}" \
    bash "$SCRIPT" > "$WORK/out" 2>&1
}
run() { dbinit "$@"; }
# The chart's restricted Pod Security defaults: non-root uid/gid 65532, no
# capabilities, no privilege escalation, HOME=/tmp (the Job's emptyDir).
run_restricted() { USER_PREFIX="setpriv --reuid=65532 --regid=65532 --clear-groups --no-new-privs" dbinit "$@"; }

run mr-1-app true none ""; rc=$?
[ $rc -eq 0 ] && [ "$(q postgres "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='mr-1-app'")" = appuser ] \
  && pass "1 create missing database owned by appuser" || { fail "1 create (rc $rc)"; cat "$WORK/out"; }

run mr-1-app false none custom.dump; rc=$?
owners=$(q mr-1-app "SELECT string_agg(DISTINCT tableowner, ',') FROM pg_tables WHERE schemaname IN ('public','extra')")
[ $rc -eq 0 ] && [ "$(q mr-1-app 'SELECT count(*) FROM t1')" = 2 ] && [ "$owners" = appuser ] \
  && pass "2 custom restore, objects owned by appuser" || { fail "2 custom restore (rc $rc, owners $owners)"; cat "$WORK/out"; }

run mr-1-app false none custom.dump; rc=$?
[ $rc -ne 0 ] && grep -q 'refusing to restore on top' "$WORK/out" \
  && pass "3 restore on top refused" || { fail "3 restore on top not refused (rc $rc)"; cat "$WORK/out"; }

su -d mr-1-app -c "SET ROLE appuser; CREATE TABLE leftover(id int)"
run mr-1-app false tables plain.sql.gz; rc=$?
[ $rc -eq 0 ] && [ "$(q mr-1-app "SELECT count(*) FROM pg_tables WHERE tablename='leftover'")" = 0 ] \
  && [ "$(q mr-1-app 'SELECT count(*) FROM extra.t2')" = 0 ] && [ "$(q mr-1-app 'SELECT count(*) FROM t1')" = 2 ] \
  && pass "4 drop tables + gzipped plain restore" || { fail "4 drop tables (rc $rc)"; cat "$WORK/out"; }

run mr-1-app false database custom.dump; rc=$?
[ $rc -eq 0 ] && [ "$(q mr-1-app 'SELECT count(*) FROM t1')" = 2 ] \
  && pass "5 drop database + custom restore" || { fail "5 drop database (rc $rc)"; cat "$WORK/out"; }

run mr-1-missing false none ""; rc=$?
[ $rc -ne 0 ] && grep -q 'does not exist' "$WORK/out" \
  && pass "6 missing database without create fails" || { fail "6 (rc $rc)"; cat "$WORK/out"; }

OWNER=nobody run mr-1-other true none ""; rc=$?
[ $rc -ne 0 ] && grep -q 'owner role nobody does not exist' "$WORK/out" \
  && pass "7 missing owner role fails" || { fail "7 (rc $rc)"; cat "$WORK/out"; }

su -d mr-1-app -c "SET ROLE appuser; CREATE TABLE marker_probe(id int)"
ACTION_ID=abc run mr-1-app false database custom.dump; rc1=$?
su -d mr-1-app -c "SET ROLE appuser; CREATE TABLE after_first(id int)"
ACTION_ID=abc run mr-1-app false database custom.dump; rc2=$?
[ $rc1 -eq 0 ] && [ $rc2 -eq 0 ] && grep -q 'already applied' "$WORK/out" \
  && [ "$(q mr-1-app "SELECT count(*) FROM pg_tables WHERE tablename='after_first'")" = 1 ] \
  && pass "8 an identical request acts once (marker)" || { fail "8 marker (rc $rc1/$rc2)"; cat "$WORK/out"; }
ACTION_ID=def run mr-1-app false database custom.dump; rc=$?
[ $rc -eq 0 ] && [ "$(q mr-1-app "SELECT count(*) FROM pg_tables WHERE tablename='after_first'")" = 0 ] \
  && pass "9 a new request id repeats it" || { fail "9 new run id (rc $rc)"; cat "$WORK/out"; }

app_connects() { PGPASSWORD=app psql -X -q -h localhost -U appuser -d "$1" -tAc 'SELECT 1' 2>/dev/null; }
[ "$(app_connects mr-1-app)" = 1 ] && [ "$(q mr-1-app "SELECT e::text FROM t1 WHERE id=2")" = "[4,5,6]" ] \
  && [ "$(q mr-1-app "SELECT pg_get_userbyid(extowner) FROM pg_extension WHERE extname='vector'")" = dbadmin ] \
  && pass "10 pgvector data restored; the application can connect again afterwards" || fail "10 vector data / CONNECT after run"

EXTENSIONS="vector pg_trgm" run mr-1-ext true none ""; rc=$?
[ $rc -eq 0 ] && [ "$(q mr-1-ext "SELECT string_agg(extname, ',' ORDER BY extname) FROM pg_extension WHERE extname <> 'plpgsql'")" = pg_trgm,vector ] \
  && pass "10a extensions created by the admin" || { fail "10a extensions (rc $rc)"; cat "$WORK/out"; }

# a dump that switches back to the admin's role is refused before anything runs
{ gunzip -c "$WORK/plain.sql.gz"; printf 'RESET ROLE;\nCREATE ROLE escalated;\n'; } | gzip > "$WORK/evil.sql.gz"
run mr-1-evil true tables evil.sql.gz; rc=$?
[ $rc -ne 0 ] && grep -q 'switches roles' "$WORK/out" && [ "$(q postgres "SELECT count(*) FROM pg_roles WHERE rolname='escalated'")" = 0 ] \
  && pass "10b plain dump with RESET ROLE refused, nothing executed" || { fail "10b role switch not refused (rc $rc)"; cat "$WORK/out"; }
su -c "CREATE DATABASE src2 OWNER produser"
su -d src2 -c "SET ROLE produser; CREATE TABLE t(id int);
               CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS \$\$
BEGIN
SET ROLE postgres;
END \$\$;"
PGPASSWORD=root pg_dump -h localhost -U postgres -Fc src2 > "$WORK/evil.dump"
run mr-1-evil2 true tables evil.dump; rc=$?
[ $rc -ne 0 ] && grep -q 'switches roles' "$WORK/out" \
  && pass "10c custom archive with a role switch refused" || { fail "10c archive role switch not refused (rc $rc)"; cat "$WORK/out"; }

# restricted Pod Security: create, custom-archive restore, drop tables +
# gzipped plain restore
run_restricted mr-1-r true none ""; rc=$?
[ $rc -eq 0 ] && pass "R1 restricted: create database" || { fail "R1 restricted create (rc $rc)"; cat "$WORK/out"; }
run_restricted mr-1-r false none custom.dump; rc=$?
[ $rc -eq 0 ] && [ "$(q mr-1-r 'SELECT count(*) FROM t1')" = 2 ] \
  && pass "R2 restricted: custom restore" || { fail "R2 restricted custom restore (rc $rc)"; cat "$WORK/out"; }
run_restricted mr-1-r false tables plain.sql.gz; rc=$?
[ $rc -eq 0 ] && [ "$(q mr-1-r 'SELECT count(*) FROM t1')" = 2 ] \
  && pass "R3 restricted: drop tables + plain restore" || { fail "R3 restricted plain restore (rc $rc)"; cat "$WORK/out"; }

# --- rendered Jobs ---------------------------------------------------------------
# Runs the containers of a rendered Job in order (fetch excluded: the dump is
# placed in /work instead) with their commands and environment, sharing /work;
# the chart's scripts are at /work/scripts. Secrets are injected as in the
# Job (PGUSER/PGPASSWORD of the admin, ZED_TOKEN).
run_rendered() {  # <rendered yaml>
  local job=$1 rc=0
  rm -rf /work; mkdir -p /work/scripts; cp "$CHART/files/." /work/scripts/ -r
  [ -f "$WORK/work-dump" ] && cp "$WORK/work-dump" /work/dump
  python3 - "$job" > "$WORK/steps" <<'PY'
import sys, yaml, json
job = next(d for d in yaml.safe_load_all(open(sys.argv[1])) if d and d["kind"] == "Job")
spec = job["spec"]["template"]["spec"]
for c in spec.get("initContainers", []) + spec["containers"]:
    if c["name"] == "fetch":
        continue
    env = {e["name"]: e.get("value", "") for e in c.get("env", [])}
    env.update(PGUSER="dbadmin", PGPASSWORD="admin", ZED_TOKEN="key")
    cmd = [a.replace("/scripts/", "/work/scripts/") for a in c["command"] + c.get("args", [])]
    print(json.dumps({"name": c["name"], "cmd": cmd, "env": env}))
PY
  local step
  while read -r step; do
    local args=()   # NUL-separated: the container scripts span several lines
    while IFS= read -r -d '' a; do args+=("$a"); done < <(printf '%s' "$step" | python3 -c '
import sys, json
s = json.load(sys.stdin)
sys.stdout.write("".join(a + "\0" for a in [f"{k}={v}" for k, v in s["env"].items()] + s["cmd"]))')
    env -i PATH="$PATH" HOME=/tmp "${args[@]}" >> "$WORK/out" 2>&1 || { rc=$?; break; }
  done < "$WORK/steps"
  return $rc
}
render() { helm template t "$CHART" --set global.stage.name=mr-1 --set admin.secretStore.name=test-store \
  --set admin.remoteKey=test/admin --set-string guard.dumpPattern=. --set connection.host=localhost \
  --set connection.sslmode=disable "$@"; }

# SpiceDB restore Job: check-marker → restore → record-marker
su -c "CREATE DATABASE \"mr-1-spicedb\" OWNER appuser"
printf 'definition user {}\n\ndefinition doc {\n    relation viewer: user\n}\n' > "$WORK/schema.zed"
zedc schema write "$WORK/schema.zed" >/dev/null
zedc relationship create doc:1 viewer user:alice >/dev/null
zedc backup create "$WORK/work-dump" >/dev/null 2>&1
zedc relationship delete doc:1 viewer user:alice >/dev/null
render --set spicedb.restore=true --set spicedb.dump=https://example.invalid/b.zedbackup \
  --set spicedb.markerDatabase=mr-1-spicedb --set spicedb.endpoint=localhost:50051 \
  -s templates/spicedb-restore.yaml > "$WORK/spicedb-job.yaml"
rel() { zedc relationship read doc --consistency-full 2>/dev/null; }
: > "$WORK/out"; run_rendered "$WORK/spicedb-job.yaml"; rc=$?
[ $rc -eq 0 ] && [ "$(rel)" = "doc:1 viewer user:alice" ] \
  && pass "11 rendered SpiceDB restore Job restores the relationships" || { fail "11 spicedb restore (rc $rc, rel '$(rel)')"; cat "$WORK/out"; }
zedc relationship delete doc:1 viewer user:alice >/dev/null
: > "$WORK/out"; run_rendered "$WORK/spicedb-job.yaml"; rc=$?
[ $rc -eq 0 ] && [ -z "$(rel)" ] && grep -q 'already applied' "$WORK/out" \
  && pass "12 an identical SpiceDB request acts once (deleted relationship stays deleted)" || { fail "12 spicedb marker (rc $rc, rel '$(rel)')"; cat "$WORK/out"; }

# Qdrant restore Job
qd -X PUT "$QD/collections/src" -H 'Content-Type: application/json' -d '{"vectors":{"size":3,"distance":"Cosine"}}' >/dev/null
qd -X PUT "$QD/collections/src/points?wait=true" -H 'Content-Type: application/json' \
   -d '{"points":[{"id":1,"vector":[1,0,0]},{"id":2,"vector":[0,1,0]},{"id":3,"vector":[0,0,1]}]}' >/dev/null
snap=$(qd -X POST "$QD/collections/src/snapshots?wait=true" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["name"])')
qd "$QD/collections/src/snapshots/$snap" > "$WORK/work-dump"
count() { qd -X POST "$QD/collections/$1/points/count" -H 'Content-Type: application/json' -d '{"exact":true}' 2>/dev/null |
          python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["count"])' 2>/dev/null || echo absent; }
render_qdrant() {
  render --set defaults.owner=appuser --set qdrant.url="$QD" --set qdrant.collections.data.name=mr-1-data \
    --set qdrant.collections.data.snapshot=https://example.invalid/data.snapshot --set defaults.restore=true "$@" \
    -s templates/qdrant-jobs.yaml > "$WORK/qdrant-job.yaml"
}
render_qdrant; : > "$WORK/out"; run_rendered "$WORK/qdrant-job.yaml"; rc=$?
[ $rc -eq 0 ] && [ "$(count mr-1-data)" = 3 ] \
  && pass "13 rendered Qdrant Job restores the snapshot into mr-1-data" || { fail "13 qdrant restore (rc $rc)"; cat "$WORK/out"; }
qd -X POST "$QD/collections/mr-1-data/points/delete?wait=true" -H 'Content-Type: application/json' -d '{"points":[1]}' >/dev/null
: > "$WORK/out"; run_rendered "$WORK/qdrant-job.yaml"; rc=$?
[ $rc -eq 0 ] && [ "$(count mr-1-data)" = 2 ] && grep -q 'already applied' "$WORK/out" \
  && pass "14 an identical Qdrant request acts once" || { fail "14 qdrant marker (rc $rc)"; cat "$WORK/out"; }
render_qdrant --set runId=2b; : > "$WORK/out"; run_rendered "$WORK/qdrant-job.yaml"; rc=$?
[ $rc -ne 0 ] && [ "$(count mr-1-data)" = 2 ] && grep -q 'refusing to restore over it' "$WORK/out" \
  && pass "14b a restore over an existing collection without drop is refused" || { fail "14b qdrant restore on top (rc $rc)"; cat "$WORK/out"; }
render_qdrant --set defaults.drop=database --set runId=2; : > "$WORK/out"; run_rendered "$WORK/qdrant-job.yaml"; rc=$?
[ $rc -eq 0 ] && [ "$(count mr-1-data)" = 3 ] && grep -q 'deleting collection' "$WORK/out" \
  && pass "15 drop + restore with a new run id" || { fail "15 qdrant drop/restore (rc $rc)"; cat "$WORK/out"; }

# teardown Job
rm -f "$WORK/work-dump"
su -c 'CREATE DATABASE "mr-1-keep" OWNER appuser'   # not listed: must survive
render --set qdrant.url="$QD" --set qdrant.collections.data.name=mr-1-data \
  --set databases.app.name=mr-1-app --set databases.sp.name=mr-1-spicedb --set databases.gone.name=mr-1-never-created \
  --set teardown.enabled=true --set teardown.confirm=mr-1 -s templates/teardown.yaml > "$WORK/teardown-job.yaml"
: > "$WORK/out"; run_rendered "$WORK/teardown-job.yaml"; rc=$?
left=$(q postgres "SELECT count(*) FROM pg_database WHERE datname IN ('mr-1-app','mr-1-spicedb')")
[ $rc -eq 0 ] && [ "$left" = 0 ] && [ "$(count mr-1-data)" = absent ] && [ "$(q postgres "SELECT count(*) FROM pg_database WHERE datname='mr-1-keep'")" = 1 ] \
  && pass "16 rendered teardown Job drops the listed databases and collections only" || { fail "16 teardown (rc $rc, left $left)"; cat "$WORK/out"; }

echo
if [ "$FAILS" -eq 0 ]; then echo "RESULT: ALL GREEN"; exit 0; fi
echo "RESULT: $FAILS FAILURE(S)"; exit 1
