# redis

Leaf chart for Redis standalone/HA instances. Wraps the community
`cloudpirates/redis` chart (OCI, Bitnami-compatible API) with project defaults
and the standard helper conventions used across these charts, so every Redis
instance follows one configuration pattern.

## Upstream chart

| | |
|---|---|
| OCI | `oci://registry-1.docker.io/cloudpirates/redis` |
| Version | `0.26.4` |
| App version | `8.6.1` |
| Docs | https://github.com/CloudPirates-io/helm-charts/tree/main/charts/redis |

## Behaviour

| Aspect | This chart (`cloudpirates/redis`) |
|---|---|
| Workload type | `StatefulSet` (suited for stateful Redis, required for `volumeClaimTemplates`) |
| Persistence | `StatefulSet.spec.volumeClaimTemplates` |
| Services | `Service` (primary) + `{name}-headless` (always created, for DNS-based discovery) |
| Redis flags | `extraConfig` redis.conf directives, e.g. `"appendonly yes"`, `"maxmemory 256mb\nmaxmemory-policy allkeys-lru"` |
| Pull secrets | `global.imagePullSecrets` |
| Stage naming | `redis.fullnameOverride` in the environment values |

## Usage as a chart dependency

### 1. Single instance in a service chart

```yaml
# service-chart/Chart.yaml
dependencies:
  - name: redis
    version: "0.1.0"
    repository: "file://../../04-shared-services/redis"
    condition: redis.enabled
```

```yaml
# service-chart/values.yaml
redis:
  redis:
    fullnameOverride: "my-service-redis"
    extraConfig: "appendonly yes"
    auth:
      enabled: false
```

### 2. Multiple instances in an umbrella chart (alias pattern)

Use chart aliases when an umbrella deploys more than one Redis instance:

```yaml
# Chart.yaml
dependencies:
  - name: redis
    alias: redis-formale-pruefung
    version: "0.1.0"
    repository: "file://../../04-shared-services/redis"
    condition: redis-formale-pruefung.enabled
  - name: redis
    alias: redis-sessions
    version: "0.1.0"
    repository: "file://../../04-shared-services/redis"
    condition: redis-sessions.enabled
```

```yaml
# values.yaml
redis-formale-pruefung:
  enabled: true
  redis:
    fullnameOverride: "formale-pruefung-redis"
    extraConfig: "appendonly yes"
    auth:
      enabled: false

redis-sessions:
  enabled: true
  redis:
    fullnameOverride: "redis-sessions"
    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 500m
        memory: 512Mi
    extraConfig: |
      appendonly yes
      maxmemory 256mb
      maxmemory-policy allkeys-lru
    auth:
      enabled: false
```

### 3. Stage-aware naming

The upstream chart's `fullnameOverride` is the primary naming lever. Include
a stage suffix by setting it explicitly in environment-specific values files:

```yaml
# values-production.yaml
redis-sessions:
  redis:
    fullnameOverride: "redis-sessions"      # no suffix needed (already unique)

# values-testing.yaml
redis-sessions:
  redis:
    fullnameOverride: "redis-sessions-test"  # explicit stage suffix
```

## HA / Sentinel

```yaml
redis:
  redis:
    fullnameOverride: "oauth2-proxy-redis"
    architecture: replication
    replicaCount: 3
    sentinel:
      enabled: true
    auth:
      enabled: true
      existingSecret: "oauth-redis-password"
      existingSecretPasswordKey: "password"
    image:
      registry: <container-registry>
      repository: <redis-repository>
      tag: "<image-tag>"
```
