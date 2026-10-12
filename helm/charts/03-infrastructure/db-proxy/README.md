# db-proxy

In-cluster PostgreSQL endpoints for an environment whose databases live on a
server outside the cluster. Both components are opt-in; with the defaults the
chart renders nothing.

| Component | Use | Service |
|---|---|---|
| `cloudSqlProxy` | [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy) in front of a Google Cloud SQL instance: clients connect in plaintext, the proxy connects over TLS (private IP by default) and authenticates with the pod's Google identity | `cloudSqlProxy.name`, default `<fullname>-cloudsql-proxy`, port 5432 |
| `pgbouncer` | PgBouncer connecting straight to the server over TLS, session mode by default — for clients that need session semantics (e.g. schema migrations with session-level advisory locks) | `pgbouncer.name`, default `<fullname>-pgbouncer`, port 5432 |

Clients connect to `<name>.<namespace>.svc.cluster.local:5432`.

## Cloud SQL Auth Proxy

```yaml
cloudSqlProxy:
  enabled: true
  instanceConnectionName: <project>:<region>:<instance>
```

The proxy needs `roles/cloudsql.client`. On GKE with Workload Identity, bind
a Google service account to the chart's ServiceAccount
(`serviceAccount.annotations`, `iam.gke.io/gcp-service-account: <gsa>`);
without Workload Identity it uses the node's service account. Health checks
and Prometheus metrics are served on `httpPort` (9090). Further proxy flags
go to `cloudSqlProxy.extraArgs`.

## PgBouncer

```yaml
pgbouncer:
  enabled: true
  server: {host: <server address>, port: 5432, sslmode: require}
  auth:
    existingSecret: <secret with userlist.txt>
```

The auth file (`auth.key` in `auth.existingSecret`, one `"<user>" "<password>"`
line per login) holds the credentials PgBouncer accepts and forwards; create
it with your secret tooling (e.g. an ExternalSecret template). Pool mode,
connection limits and further `[pgbouncer]` settings are values
(`poolMode`, `maxClientConn`, `defaultPoolSize`, `serverIdleTimeout`,
`extraSettings`). The default image is the CloudNativePG PgBouncer image;
`runAsUser` / `runAsGroup` follow its `pgbouncer` user.

## Common settings

Restricted Pod Security Standard by default (non-root, RuntimeDefault
seccomp, no privilege escalation, every capability dropped, read-only root
filesystem); no ServiceAccount token is mounted. `podAnnotations` /
`podLabels` apply to both components — e.g. `sidecar.istio.io/inject: "false"`
to keep the endpoints out of a service mesh whose outbound policy would block
the server. Replicas spread over nodes (`spreadAcrossNodes`) and keep a
PodDisruptionBudget (`podDisruptionBudget`) when more than one runs.
