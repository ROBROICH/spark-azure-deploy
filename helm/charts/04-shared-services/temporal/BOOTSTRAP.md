# Default namespace reconciliation

For a fresh Temporal installation, opt into the wrapper's bootstrap Job:

```yaml
bootstrapJob:
  enabled: true
temporal:
  server:
    config:
      namespaces:
        create: false
searchAttributesJob:
  enabled: false
```

This replaces the upstream namespace creator and the wrapper's PostSync
search-attribute hook for that installation. The render refuses competing
creators. It leaves the upstream database schema Job enabled.

The bootstrap is a normal Sync-wave-0 Job. In a single pod/process it:

1. Waits for the frontend's cluster health to be `SERVING`.
2. Describes `default`, creating it with `bootstrapJob.retention` (`60d`) only
   when it cannot yet be described. Transient creation failures wait rather
   than consume pod restarts.
3. Waits until the namespace can be queried, then ensures `ProjectId: Keyword`
   and `ProjectVersion: Int` exist and are visible to the API.

An existing namespace's retention is preserved. An attribute with the wrong
type fails clearly; bootstrap never drops namespaces, workflow data or search
attributes. RPC failures are logged and polled within the same pod.

`backoffLimit: 0` and `restartPolicy: Never` prevent Kubernetes retry loops.
`bootstrapJob.activeDeadlineSeconds` (default `900`) bounds the entire Job,
including pod scheduling. A permanently unavailable or unauthorized server
therefore produces a failed Job with useful logs instead of hanging forever.
The interval is `bootstrapJob.pollIntervalSeconds` (default `5`).

ArgoCD uses `Force=true,Replace=true` on this resource so an explicit sync can
recreate a completed/failed Job. There are no Helm or ArgoCD hook annotations:
PreSync would precede the server; PostSync or a later wave would wait on
workers that need `default`. The completed Job is retained for diagnostics
until the next sync, avoiding TTL-triggered self-heal loops. For Helm CLI
upgrades that change the immutable Job template, remove only the old bootstrap
Job first or use your operator's Job-replacement procedure; use `--wait
--wait-for-jobs` to wait for bootstrap completion.

The address defaults to the upstream fullname's frontend Service in the
wrapper namespace; override `bootstrapJob.temporalAddress` for a remote
server. The ServiceAccount defaults to the shared global KSA, then the
upstream KSA; `bootstrapJob.serviceAccountName` overrides both. The pod mounts
no Kubernetes API token. Configure pull secrets when the admin-tools image
comes from a private registry.

Full MR values opt into this Job automatically; other overlays retain their
existing bootstrap behavior. For an existing ArgoCD installation, refresh and
perform a full sync with pruning so the disabled old namespace Job is removed.

Offline verification from the repository root:

```bash
scripts/test/temporal-bootstrap-test.sh
charts/00-umbrella/spark-platform/test/branch-render.sh
```
