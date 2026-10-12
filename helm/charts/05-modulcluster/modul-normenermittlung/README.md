# modul-normenermittlung

Leaf chart for the Normenermittlung Temporal worker (`norm-tbm-spec-module`
image). Deployed as an add-on of the `spark-platform` umbrella; the scaffold
mirrors `modul-risikohinweiser` (sorted-env helper, `global.serviceAccount` /
`global.namespaceOverride` semantics).

Pure worker: no HTTP port (`service.enabled` defaults to false), no database;
Qdrant collections are stage-prefixed via `extraEnv` (e.g.
`<env>-normermittler` / `<env>-data`). The chart defaults carry
`<placeholder>` tokens for the Temporal, OTLP and payload-store endpoints;
the environment values must set them.
