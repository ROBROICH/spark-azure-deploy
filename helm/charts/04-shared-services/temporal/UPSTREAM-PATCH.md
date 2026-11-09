# SQL usernames from an existing Secret

The vendored upstream Temporal chart 1.6.0 includes
`upstream-sql-user-secret.patch`. It adds the opt-in SQL datastore key
`userSecretKey`, using the same `existingSecret` as the password:

```yaml
temporal:
  server:
    config:
      persistence:
        datastores:
          default:
            sql:
              existingSecret: postgres-credentials
              secretKey: password
              userSecretKey: username
```

Configure each SQL store independently (default, visibility, and optional
secondary visibility). With a nonempty `userSecretKey`, the schema/admin tools'
`SQL_USER` and the servers' `TEMPORAL_*_STORE_USER` environment variables use
`secretKeyRef`. The server configuration resolves those environment variables
at runtime, just as it does the passwords. No Helm `lookup`, plaintext
username, or Kubernetes API access is needed.

`existingSecret` is required when `userSecretKey` is set. With an empty or
omitted `userSecretKey`, the original literal `user` behavior is preserved.
The Secret must exist before schema hooks execute. Changes to Secret-backed
environment variables require a new Job/pod or a workload restart.

## Refreshing the upstream archive

`helm dependency update` in this wrapper downloads the unpatched upstream
archive. After refreshing it, extract the archive to a scratch directory,
apply the patch there, and repackage it:

```bash
# Run from this wrapper directory; WORK is an existing scratch directory.
tar -xzf charts/temporal-1.6.0.tgz -C "$WORK"
patch -d "$WORK/temporal" -p1 < upstream-sql-user-secret.patch
helm package "$WORK/temporal" --destination charts
```

Then repackage the wrapper into its parent umbrella and run the repository's
database-user Secret render tests. When upgrading upstream, review and port
the patch instead of assuming it still applies.
