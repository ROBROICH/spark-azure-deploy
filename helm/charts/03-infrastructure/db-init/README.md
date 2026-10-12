# db-init

Opt-in initialization of an environment's PostgreSQL databases and SpiceDB,
as Helm hooks (ArgoCD: PreSync / PostSync). **Nothing happens unless asked:**
a database gets a Job only when one of its switches is set.

| Switch (per database, or chart-wide under `defaults`) | Effect |
|---|---|
| `create: true` | create the database (owner `owner`) when it is missing |
| `drop: database` | `DROP DATABASE … WITH (FORCE)` and create it again |
| `drop: tables` | drop every non-system schema inside the database (CASCADE), recreate an empty `public` |
| `restore: true` | load the database's `dump` (gs:// via Workload Identity, or https:// e.g. a signed URL) |
| `extensions: [vector, …]` | the admin creates these extensions in the database (`CREATE EXTENSION IF NOT EXISTS … CASCADE`) — for extensions the owner role may not create |

- **Formats** (detected): `pg_dump -Fc` archives are restored with
  `pg_restore --single-transaction --no-owner --no-privileges --role=<owner>`;
  plain SQL (optionally gzipped) runs as the owner role in one transaction —
  dump it with `--no-owner --no-privileges`. Extensions of the dump (e.g.
  `vector`) are created by the admin first; the owner may not create them.
- **Safety:**
  - a restore into a database that still holds tables fails unless `drop`
    is set; a failed restore leaves the database empty (retryable), never
    half-filled;
  - while a database changes, CONNECT on it is revoked and its sessions are
    terminated (the application pods are still running during pre-upgrade
    hooks); CONNECT is granted back afterwards;
  - every managed database must match `guard.namePattern` (default: the stage
    name as prefix, e.g. `<stage>-…`), every dump URL `guard.dumpPattern` (a
    plain SQL dump runs in the admin's session on a shared server);
  - schemas owned by another role make `drop: tables` fail (fail-safe); large
    objects are not dropped;
  - extensions are created in the database's default schema (dumps with
    extensions in another schema need that schema adjusted);
  - after the change CONNECT is granted to PUBLIC again (the PostgreSQL
    default) — a database that deliberately had no PUBLIC CONNECT is open
    again afterwards;
  - if a Job fails under Helm, the hook-scoped admin Secret stays in the
    namespace until the next run (Helm applies `hook-failed` only to the
    failing Job; ArgoCD removes it). Delete it by hand after a failed
    teardown.
- **Acts once:** the Job records each drop/restore request (drop mode + dump
  location without query string, so re-signed URLs count as the same + `runId`)
  as the database comment and skips an identical request later
  — a request left in place (e.g. a value re-applied on every GitOps sync)
  does not wipe the database again. A new `runId` repeats it.
- **Chart-wide requests** (`defaults.restore`, `defaults.drop`) skip databases
  without a dump; give databases that must never be dropped by such a request
  (e.g. Temporal, recreated by its schema jobs) `drop: none`.
- **Qdrant** (`qdrant.url`, `qdrant.collections.<key>.{name,snapshot}`): a
  collection restores its Qdrant snapshot on a restore request (its own
  `restore` or `defaults.restore`). Like a database, an existing collection
  is not restored over: that needs `drop`/`defaults.drop` (any value but
  `none`), which deletes it first. Collections
  without a snapshot are left alone (the writer modules create them lazily).
  Acts once per request (marker: alias `<collection>--db-init-<id>`).
- **Teardown** (`teardown.enabled`): renders only a Job that drops every
  listed database, deletes every listed collection and removes the
  `teardown.objectPrefixes` (gs://). Requires `teardown.confirm` to repeat the
  stage name; names must match `guard.namePattern`, prefixes
  `teardown.prefixPattern`. Only "matched no objects" counts as an empty
  prefix — any other storage error fails the Job. Meant for removing the
  data of a short-lived environment (e.g. a branch environment) before its
  namespace is deleted.
- **SpiceDB** (`spicedb.dump`, `spicedb.restore`): a `zed backup` file (zed ≥
  1.0: `zed backup create`; older zed releases such as v0.15 only know
  `zed backup <file>`) restored with `--conflict-strategy touch` once the
  environment's SpiceDB answers (post-install, retried). Acts once as well —
  recorded as the comment of `spicedb.markerDatabase`, the SpiceDB datastore
  database, which must never get `drop`/`restore` itself (the spicedb-operator
  does not migrate a dropped datastore again).

Admin credentials come from the secret store (`admin.secretStore`,
`admin.remoteKey` with the properties `admin.usernameProperty` /
`admin.passwordProperty`, see [values.yaml](values.yaml)) through a hook
ExternalSecret that is deleted again when the hook event has finished; the
Jobs run as the hook ServiceAccount `<release>-db-init`. The release's normal
ExternalSecrets and ServiceAccount do not exist yet when pre-install hooks run.
The admin must be able to create databases and act as the owner roles (the
script grants itself membership `WITH SET` when missing — PostgreSQL 16 gives a
`CREATEROLE` admin only ADMIN OPTION on the roles it created).

gs:// dumps need `serviceAccount.gcpServiceAccount` (a GSA with
`storage.objectViewer` on the dump bucket and a Workload Identity binding for
`<namespace>/<release>-db-init`) — or use signed https URLs.

Helm CLI: restores can take longer than Helm's 5-minute default — use
`--timeout 60m`. The postgres client image (`images.postgres`) must be at
least the major version of the `pg_dump` that wrote the dumps.

`test/db-init-test.sh` runs the script against a real PostgreSQL 16 with
pgvector (docker) and a non-superuser admin — create, extensions, custom/plain/gzip
restores incl. vector data, drop modes, refusals, act-once, CONNECT restored —
and runs the rendered SpiceDB restore, Qdrant restore and teardown Jobs'
containers against a real SpiceDB and Qdrant (v1.17.1) — 16 cases.
