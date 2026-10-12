# fallvergleichsservice

Leaf chart for the fallvergleichsservice (case-comparison backend). Deployed
as an add-on of the `spark-platform` umbrella; the scaffold mirrors
`modul-risikohinweiser` (sorted-env helper, `global.serviceAccount` /
`global.namespaceOverride` semantics).

HTTP API on :8000 with the standardized probe endpoints (`/startup`,
`/healthz`, `/ready`). Owns one PostgreSQL database (`fallvergleichsservice-db`
base name, prefixed per environment and provisioned with the other
environment databases). All database access uses the consolidated
`postgres-credentials` Secret of the environment.
