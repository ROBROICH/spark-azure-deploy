# gateway-routes

Per-environment Envoy Gateway routing for a SPARK environment. Deployed
**into the environment namespace** (e.g. `my-env`) as a subchart of the
`spark-platform` umbrella. The Gateway `api-gateway` itself lives in
`envoy-gateway-system` (cluster baseline) and is **not** part of this chart.

## What it renders

| Resource | Name | Purpose |
|---|---|---|
| HTTPRoute | `api-route` | `api.<domain>` path map → 15 backend services (+ `/dms/v1/v2/internal/` block rule) |
| HTTPRoute | `api-v2-route` | `api.<domain>/v2/<module>/` → the modulith's `/api/v2/<module>/` (10 modules) |
| HTTPRoute | `api-metrics-block-route` | Blocks `/fpp/v1/metrics*` on the api host |
| HTTPRoute | `dashboard-route` | `dashboard.<domain>/app` → frontend SPA; with `landing.enabled=false` also 302-redirects the apex `/` → `/app` |
| HTTPRoute | `dashboard-api-route` | `dashboard.<domain>/api/*` proxies (incl. `/api/me` → Keycloak userinfo) |
| HTTPRoute | `dashboard-api-route-extra` | `/api/feedback/v1/`, `/api/v2/feedback/` |
| HTTPRoute | `dashboard-metrics-block-route` | Blocks `/api/identity/metrics*`, `/api/fpp/v1/metrics*` |
| HTTPRoute | `landing-route` | `dashboard.<domain>/` + landing assets → landingpage chart Service; public, NOT behind OIDC (`landing.enabled=true`) |
| HTTPRoute | `temporal-route` | `temporal.<domain>` → Temporal Web UI |
| HTTPRoute | `http-to-https-redirect` | 301 on the env's http listener |
| SecurityPolicy | `oidc-policy` | OIDC (Keycloak realm `<env>`) + CORS for the three dashboard routes |
| SecurityPolicy | `jwt-api-policy` | JWT (`realm_access.roles` ∈ `auth.allowedRoles`) + CORS for `api-route` and `api-v2-route` |
| SecurityPolicy | `temporal-oidc-policy` | OIDC for `temporal-route`; optionally requires a realm role (`temporalAuthorization`) |
| Backend | `keycloak-external` | External FQDN `auth.keycloakHost` (namespaced, per env) |
| BackendTLSPolicy | `keycloak-external-tls` | System-CA TLS validation for that Backend |
| HTTPRoutes + SecurityPolicy | `<key>-route`, `<key>-api-route`, `<key>-api-route-extra`, `<key>-metrics-block-route`, `<key>-oidc-policy` | per `extraDashboards` entry: a further dashboard host (its own frontend chart and OIDC session) |
| HTTPRoute + SecurityPolicy | `<key>-route`, `<key>-oidc-policy` | per `extraSites` entry: a host routed to one backend chart's Service under `/`, behind OIDC |
| HTTPRoute | `<key>-route` | per `extraRoutes` entry (opt-in): further paths of a host group outside the OIDC/JWT policies |
| ReferenceGrant | `httproutes-from-<release namespace>` | in every foreign backend namespace (`backendNamespace(s)`) |

## Prerequisites (outside this chart)

- Gateway `api-gateway` in `envoy-gateway-system` with listeners `https-<env>` /
  `http-<env>` for `*.<domain>` and `allowedRoutes` admitting the environment
  namespace (e.g. a Gateway that selects namespaces labeled
  `example.com/environment: "true"`, set through `environment-config`
  `namespace.labels` or on the pre-created namespace).
- Secret `envoy-gateway-credentials` (key `client-secret`) in this namespace —
  rendered by the `environment-config` chart from the realm's `envoy-gateway`
  client.
- The spark-environment leaf charts, the temporal wrapper and (with
  `landing.enabled=true`) the landingpage chart in the same release and
  namespace: backend names are computed from `Release.Name` + chart name +
  stage suffix.

## Key values

| Key | Default | Meaning |
|---|---|---|
| `global.stage.name` / `stage.name` | `""` | Env name; drives the backend `-<stage>` suffix, the `https-<stage>` sections, realm and domain |
| `domain` | `""` → `<stage>.<baseDomain>` | Env domain, e.g. `my-env.envs.example.com` |
| `baseDomain` | `""` (required unless `domain` is set) | Base for the derived domain, e.g. `envs.example.com` |
| `routes.{api,temporal,redirect}.enabled` | `true` | Route groups besides the dashboard host; a frontend preview renders the dashboard host only |
| `backendNamespace`, `backendNamespaces.<chart>` | `""`, `{}` | Namespace of the backend Services (default: release namespace); a ReferenceGrant `httproutes-from-<release ns>` is rendered into every foreign namespace |
| `hosts.{api,dashboard,temporal}` | `""` → `<svc>.<domain>` | Per-host overrides |
| `gateway.{name,namespace}` | `api-gateway` / `envoy-gateway-system` | Parent Gateway |
| `gateway.sectionName` / `gateway.httpSectionName` | `""` → `https-<stage>` / `http-<stage>` | Listener sections; must match the Gateway's listener names |
| `auth.keycloakHost` | see [values.yaml](values.yaml) | Host of the shared Keycloak; set it to your identity provider |
| `auth.realm` | `""` → `<stage>` | Per-env realm |
| `auth.clientID` / `auth.clientSecretName` | `envoy-gateway` / `envoy-gateway-credentials` | Edge OIDC client |
| `auth.allowedRoles` | `[user, admin]` | JWT policy `realm_access.roles` values |
| `auth.audiences` | `[]` (omitted) | Optional JWT audiences |
| `cors.allowOrigins` | `[]` → `https://dashboard.<domain>` | CORS origins |
| `backendServicePort` | `80` | Port of every leaf Service |
| `backendNameOverrides` | `{}` | Per-chart service-name escape hatch (tpl-expanded) |
| `temporalWebService` / `temporalWebPort` | `""` → `<release>-temporal-web` / `8080` | Temporal UI Service of the temporal wrapper chart |
| `landing.enabled` / `landing.service` | `false` / `""` → `<release>-landingpage-<stage>` | `true` serves the landing page at the apex from the landingpage chart; `false` auto-redirects `/` → `/app`. Single switch — the apex is never a 404 |
| `temporalAuthorization.enabled` / `.requiredRole` | `false` / `infra-admin` | Additionally require a realm role for the Temporal UI |

## Design notes

- **One listener pair per environment.** The shared Gateway carries
  `https-<env>` / `http-<env>` with a wildcard hostname per environment, so
  every HTTPS route attaches to the one HTTPS section and the redirect route to
  the one HTTP section; host selection happens in the routes' `hostnames`.
- **No ReferenceGrants.** Routes live in the env namespace and every backendRef
  (leaf Services, Temporal Web UI, landing/frontend, the namespaced Keycloak
  Backend) is in the same namespace. Route → Gateway attachment across
  namespaces is authorized by the Gateway listener's `allowedRoutes` namespace
  selector, where ReferenceGrant plays no role.
- **Backend service names** follow the leaf-chart `fullname` rule
  (`{Release.Name}-<chart>-<stage>` with the charts' truncation semantics:
  chart name 53, base 63, stage suffix 10, final 63). No leaf chart sets
  `nameOverride`/`fullnameOverride`; `backendNameOverrides` is the escape hatch.
- **Landing page path set.** `landing-route` matches the apex plus an Exact
  list of asset paths that must mirror the file list baked into the landingpage
  image; a path missing from the list falls through to a gateway 404. `/index.html` is
  included (the server 301-redirects it to `/`).
- **Spark modulith paths.** All backend modules run as the one `spark-backend`
  image (the `<module>-<stage>` Services are its pools) and serve their full
  `/api/<module>/...` path. The dashboard host therefore forwards
  `/api/<module>/v1/` and `/api/v2/<module>/` unchanged, and the api host
  rewrites `/<module>/v1/` → `/api/<module>/v1/`, `/temporal/` →
  `/api/temporal/` and `/v2/<module>/` → `/api/v2/<module>/`. Stripping to
  `/` (the pre-modulith behaviour) makes the backend answer 404. Exception:
  `rechtsaenderungs-monitoring` is not part of the modulith and keeps its
  strip-to-`/` rewrite.
- **`/api/me` userinfo proxy** rewrites to
  `/realms/<realm>/protocol/openid-connect/userinfo` with the realm templated
  per environment.
- **Application routes only.** The chart routes the SPARK Workflow services;
  cluster tooling (dashboards, debug apps) is not part of it. Every route is
  behind the OIDC (dashboard, temporal, extra sites) or JWT (api) policies,
  except opt-in `extraRoutes` (e.g. a backend token endpoint), whose backend
  authenticates the request itself.
- Gateway-scoped objects (the Gateway and its EnvoyProxy, the multi-SAN
  certificate, client-traffic and extension policies) belong to the cluster
  baseline overlays, not to a per-env chart.

## Verify

```bash
cd 03-infrastructure/gateway-routes
helm lint .
helm template t . -n my-env \
  --set global.stage.name=my-env \
  --set domain=my-env.envs.example.com
```

## Per-environment listeners (ListenerSet)

By default the routes attach to a listener pair the shared Gateway defines
for the environment (`https-<stage>` / `http-<stage>`, see `gateway`). With
`listenerSet.enabled: true` the environment brings its own listeners
instead: the chart renders a Gateway API `ListenerSet` (v1, Gateway API
v1.5+) with an `https` and an `http` listener for `listenerSet.hostname`
(default `*.<domain>`), attached to `gateway`, and every route attaches to
it. The TLS Secret lives in the release namespace; `listenerSet.tls.certificate`
can have cert-manager issue it (a wildcard needs a DNS-01 issuer).

Prerequisite: the Gateway admits ListenerSets from the environment's
namespace, e.g.

```yaml
spec:
  allowedListeners:
    namespaces:
      from: Selector
      selector:
        matchLabels: {example.com/environment: "true"}
```

## Several domains, listeners per hostname, further hosts

- `hosts.<api|dashboard|temporal>` may list several hostnames (e.g. the same
  environment under two domains). All are served; the first is the primary
  one — OIDC redirect URL and cookie domain, default CORS origin.
- A Gateway with listeners per hostname instead of one `https-<env>` pair:
  `gateway.sectionNames.<group>` names the https sections of each host group
  (`api`, `dashboard`, `temporal`, or an `extraDashboards` / `extraSites`
  key), `gateway.httpSectionName` may list several http sections.
- `extraDashboards.<key>`: a further dashboard host — the SPA from its own
  frontend chart (`frontend.chart`), the dashboard `/api` proxies, its own
  OIDC session (cookies `<key>_*`), optionally the landing page on its apex
  (`landing: true`). Its hostnames join the default CORS origins.
- `extraSites.<key>`: a host whose `/` goes to one backend chart's Service
  (`chart`, `port`), behind its own OIDC session (`oidc.temporal` settings).
- The Temporal Web UI and the landing page stay in the release namespace
  unless `backendNamespaces.temporal` / `backendNamespaces.landingpage`
  name another one (`backendNamespace` does not move them); the chart
  renders the ReferenceGrants for them.

Example: [ci/sites-values.yaml](ci/sites-values.yaml).
