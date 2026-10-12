#!/usr/bin/env bash
# db-init — create / drop / restore one PostgreSQL database.
#
# Environment (set by templates/jobs.yaml):
#   PGHOST PGPORT PGSSLMODE PGUSER PGPASSWORD  admin connection
#   DB_NAME         database to act on
#   DB_OWNER        role owning the database and every restored object
#   CREATE_MISSING  true: create the database when it is missing
#   DROP_MODE       none | database | tables
#   DUMP_FILE       dump to restore ('' = no restore); pg_dump custom format,
#                   or plain SQL (optionally gzip-compressed)
#   EXTENSIONS      extensions the admin creates in the database (space-
#                   separated; the owner role may not be allowed to)
#   ACTION_ID       identity of the requested drop/restore (hash of drop mode,
#                   dump location and run id). Recorded as the database comment
#                   after success; an identical request is skipped, so a
#                   request left in place (e.g. re-applied on every GitOps
#                   sync) acts exactly once.
#
# While a drop/restore runs, CONNECT on the database is revoked and its
# sessions are terminated, so the (still running) application cannot write
# into a half-restored database; CONNECT is granted back on exit.
# Restores run in a single transaction: a failed restore leaves the database
# empty (retryable), never half-filled.
set -euo pipefail

log() { printf '[db-init %s] %s\n' "$DB_NAME" "$*"; }
die() { log "ERROR: $*"; exit 1; }
ident() { local s=${1//\"/\"\"}; printf '"%s"' "$s"; }   # SQL identifier
literal() { local s=${1//\'/\'\'}; printf "'%s'" "$s"; }  # SQL literal
sql() { psql -X -v ON_ERROR_STOP=1 -q -d "$1" -c "$2"; }
query() { psql -X -v ON_ERROR_STOP=1 -tA -d "$1" -c "$2"; }
export PGOPTIONS="-c lock_timeout=60s"   # never hang behind an idle transaction

db=$(ident "$DB_NAME")
owner=$(ident "$DB_OWNER")

for i in $(seq 1 30); do
  pg_isready -q -d postgres && break
  [ "$i" -lt 30 ] || die "server $PGHOST:$PGPORT not ready"
  sleep 5
done

[ "$(query postgres "SELECT 1 FROM pg_roles WHERE rolname = $(literal "$DB_OWNER")")" = 1 ] \
  || die "owner role $DB_OWNER does not exist"
# CREATE DATABASE … OWNER and restoring as the owner need the right to SET
# ROLE to the owner. PostgreSQL 16 gives a CREATEROLE admin only ADMIN OPTION
# on the roles it created, so grant the membership with SET when missing
# (managed servers let the admin do that for roles it administers).
if [ "$(query postgres "SHOW server_version_num")" -ge 160000 ]; then
  can_set=$(query postgres "SELECT pg_has_role(current_user, $(literal "$DB_OWNER"), 'SET')")
  grant="GRANT $owner TO current_user WITH SET TRUE"
else
  can_set=$(query postgres "SELECT pg_has_role(current_user, $(literal "$DB_OWNER"), 'MEMBER')")
  grant="GRANT $owner TO current_user"
fi
if [ "$can_set" != t ]; then
  log "granting $PGUSER membership in $DB_OWNER"
  sql postgres "$grant" || die "admin $PGUSER cannot act as $DB_OWNER"
fi

exists=$(query postgres "SELECT 1 FROM pg_database WHERE datname = $(literal "$DB_NAME")")
marker="db-init:${ACTION_ID:-}"

if [ -n "${ACTION_ID:-}" ] && [ "$exists" = 1 ] &&
   [ "$(query postgres "SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = $(literal "$DB_NAME")")" = "$marker" ]; then
  log "request $ACTION_ID already applied — nothing to do (change runId to repeat it)"
  exit 0
fi

# --- keep the application out while the database changes --------------------
isolated=""
isolate() {
  sql postgres "GRANT CONNECT ON DATABASE $db TO current_user"
  sql postgres "REVOKE CONNECT ON DATABASE $db FROM PUBLIC, $owner"
  isolated=1
  query postgres "SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity
                  WHERE datname = $(literal "$DB_NAME") AND pid <> pg_backend_pid()" >/dev/null \
    || log "warning: could not terminate every session of $DB_NAME"
}
release() {
  [ -n "$isolated" ] || return 0
  if [ "$(query postgres "SELECT 1 FROM pg_database WHERE datname = $(literal "$DB_NAME")")" = 1 ]; then
    sql postgres "GRANT CONNECT ON DATABASE $db TO PUBLIC" || log "warning: could not re-grant CONNECT"
  fi
}
trap release EXIT
if [ "$exists" = 1 ] && { [ "$DROP_MODE" != none ] || [ -n "${DUMP_FILE:-}" ]; }; then
  isolate
fi

case "$DROP_MODE" in
  database)
    if [ "$exists" = 1 ]; then
      log "dropping database"
      sql postgres "DROP DATABASE $db WITH (FORCE)"
      exists=""
    fi ;;
  tables)
    if [ "$exists" = 1 ]; then
      log "dropping every non-system schema"
      sql "$DB_NAME" "DO \$\$ DECLARE s name; BEGIN
          FOR s IN SELECT nspname FROM pg_namespace
                   WHERE nspname NOT IN ('pg_catalog', 'information_schema')
                     AND nspname NOT LIKE 'pg\_%' LOOP
            EXECUTE format('DROP SCHEMA %I CASCADE', s);
          END LOOP; END \$\$"
      sql "$DB_NAME" "CREATE SCHEMA public AUTHORIZATION $owner"
    fi ;;
  none) ;;
  *) die "DROP_MODE must be none, database or tables (got $DROP_MODE)" ;;
esac

if [ "$exists" != 1 ]; then
  if [ "$CREATE_MISSING" = true ] || [ "$DROP_MODE" = database ]; then
    log "creating database owned by $DB_OWNER"
    sql postgres "CREATE DATABASE $db OWNER $owner"
    [ -z "${DUMP_FILE:-}" ] || isolate
  else
    die "database does not exist (set create: true)"
  fi
fi
sql postgres "ALTER DATABASE $db OWNER TO $owner"

for ext in ${EXTENSIONS:-}; do
  log "creating extension $ext"
  sql "$DB_NAME" "CREATE EXTENSION IF NOT EXISTS $(ident "$ext") CASCADE"
done

record() { [ -z "${ACTION_ID:-}" ] || sql postgres "COMMENT ON DATABASE $db IS $(literal "$marker")"; }

if [ -z "${DUMP_FILE:-}" ]; then
  record
  log "done (no restore requested)"
  exit 0
fi
[ -s "$DUMP_FILE" ] || die "dump $DUMP_FILE is missing or empty"

tables=$(query "$DB_NAME" "SELECT count(*) FROM pg_tables
                           WHERE schemaname NOT IN ('pg_catalog', 'information_schema')")
[ "$tables" = 0 ] || die "database holds $tables tables — refusing to restore on top (set drop: tables or database)"

# Extensions (e.g. vector) need the admin — the owner role may not create
# them. Create the dump's extensions first, then restore the rest as the owner.
create_extensions() {  # extension names on stdin
  local ext
  while read -r ext; do
    [ -n "$ext" ] || continue
    log "creating extension $ext"
    sql "$DB_NAME" "CREATE EXTENSION IF NOT EXISTS $(ident "$ext") CASCADE"
  done
}

# The restore runs in the admin's session under SET ROLE <owner> (plain SQL)
# or pg_restore --role (archives): a statement that switches the role or the
# session back would run the rest of the dump as the admin of the shared
# server. Refuse any dump that contains one (fails closed: a function body
# with such a line is refused as well).
ROLE_SWITCH='^[[:space:]]*((RESET|SET)[[:space:]]+((SESSION|LOCAL)[[:space:]]+)?(ROLE|SESSION[[:space:]]+AUTHORIZATION)|\\(c|connect)([[:space:]]|$))'
refuse_role_switches() {  # SQL text on stdin
  if grep -qiE "$ROLE_SWITCH"; then
    die "the dump switches roles or reconnects (SET/RESET ROLE, SESSION AUTHORIZATION or \\connect) — refusing to restore it"
  fi
}

magic=$(head -c 5 "$DUMP_FILE" | od -An -c | tr -d ' \n')
if [ "$magic" = PGDMP ]; then
  pg_restore --schema-only -f - "$DUMP_FILE" | refuse_role_switches
  pg_restore -l "$DUMP_FILE" > /tmp/toc
  # TOC lines: "<id>; <oid> <oid> EXTENSION - <name> <owner>"
  awk '$4 == "EXTENSION" { print $6 }' /tmp/toc | create_extensions
  grep -v -E '^[0-9]+; [0-9]+ [0-9]+ (EXTENSION|COMMENT - EXTENSION) ' /tmp/toc > /tmp/toc.restore
  log "restoring pg_dump custom archive as $DB_OWNER"
  pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --role="$DB_OWNER" \
    -L /tmp/toc.restore -d "$DB_NAME" "$DUMP_FILE"
else
  reader=(cat "$DUMP_FILE")
  if [ "$(head -c 2 "$DUMP_FILE" | od -An -tx1 | tr -d ' \n')" = 1f8b ]; then
    reader=(gunzip -c "$DUMP_FILE")
  fi
  "${reader[@]}" | refuse_role_switches
  "${reader[@]}" | sed -n -E 's/^CREATE EXTENSION (IF NOT EXISTS )?"?([A-Za-z0-9_-]+)"?.*/\2/p' | create_extensions
  log "restoring plain SQL dump as $DB_OWNER"
  { printf 'SET ROLE %s;\n' "$owner"
    "${reader[@]}" | grep -v -E '^(CREATE EXTENSION|COMMENT ON EXTENSION) '
  } | psql -X -v ON_ERROR_STOP=1 -q --single-transaction -d "$DB_NAME"
fi
record
log "done (restored $(query "$DB_NAME" "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')") tables)"
