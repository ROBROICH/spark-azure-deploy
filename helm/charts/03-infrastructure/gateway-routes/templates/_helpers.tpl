{{/*
DNS-safe chart name (lowercase, dots → hyphens).
*/}}
{{- define "gateway-routes.chartName" -}}
{{- $n := default .Chart.Name .Values.nameOverride | toString -}}
{{- $n | lower | replace "." "-" | trunc 53 | trimSuffix "-" -}}
{{- end }}

{{/*
Expand the name of the chart (app.kubernetes.io/name label).
*/}}
{{- define "gateway-routes.name" -}}
{{- include "gateway-routes.chartName" . -}}
{{- end }}

{{/*
Chart name and version used for the helm.sh/chart label.
*/}}
{{- define "gateway-routes.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
(Same precedence as the leaf-chart helpers, e.g. 02-backend/spark-backend-pool.)
*/}}
{{- define "gateway-routes.effectiveStageName" -}}
{{- $local := .Values.stage | default dict -}}
{{- $gst := (.Values.global | default dict).stage | default dict -}}
{{- if $local.name -}}
{{- $local.name | toString -}}
{{- else if $gst.name -}}
{{- $gst.name | toString -}}
{{- end -}}
{{- end }}

{{/*
Stage suffix appended to backend service names (e.g. "-my-env"). Empty when no stage is set.
EXACT copy of the leaf-chart `stageSuffix` semantics (lower, dots → hyphens, trunc 10,
trimSuffix "-") so the names this chart computes match what the leaf charts render.
*/}}
{{- define "gateway-routes.stageSuffix" -}}
{{- $sn := include "gateway-routes.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Backend Service name for a given leaf chart, replicating the leaf-chart `fullname`
helper: {Release.Name}-{chartName}-{stageSuffix} with the exact truncation steps
(chartName trunc 53, base trunc 63, base+suffix trunc 63; each trimSuffix "-").
ASSUMES the leaf charts run without nameOverride/fullnameOverride/chart-local
stage.name.
Call with: include "gateway-routes.backendName" (dict "root" $ "chart" "<chart-name>")
Per-chart escape hatch: .Values.backendNameOverrides.<chart-name> (tpl-expanded).
*/}}
{{- define "gateway-routes.backendName" -}}
{{- $root := .root -}}
{{- $chart := .chart | toString -}}
{{- $overrides := $root.Values.backendNameOverrides | default dict -}}
{{- if hasKey $overrides $chart -}}
{{- tpl (get $overrides $chart | toString) $root -}}
{{- else -}}
{{- $chartName := $chart | lower | replace "." "-" | trunc 53 | trimSuffix "-" -}}
{{- $base := printf "%s-%s" $root.Release.Name $chartName | trunc 63 | trimSuffix "-" -}}
{{- $suffix := include "gateway-routes.stageSuffix" $root -}}
{{- printf "%s%s" $base $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Namespace of a backend Service for a chart: backendNamespaces.<chart>, else
backendNamespace (both tpl-expanded); empty = the route's own namespace
(no namespace field rendered). Cross-namespace backends need a ReferenceGrant
in the backend namespace, which templates/referencegrants.yaml renders.
Call with: include "gateway-routes.backendNamespace" (dict "root" $ "chart" "<chart-name>")
*/}}
{{- define "gateway-routes.backendNamespace" -}}
{{- $root := .root -}}
{{- $ns := get ($root.Values.backendNamespaces | default dict) .chart | default $root.Values.backendNamespace | default "" -}}
{{- $ns = tpl ($ns | toString) $root -}}
{{- if and $ns (ne $ns $root.Release.Namespace) -}}
{{- $ns -}}
{{- end -}}
{{- end }}

{{/*
Extra routes (extraRoutes), sorted by key. hosts default to the group's
hostnames (api/dashboard/temporal, or an extraDashboards / extraSites key).
Fields: key, group, hosts, sectionNames, matches, rewrite, chart, port.
*/}}
{{- define "gateway-routes.extraRoutes" -}}
{{- $routes := list -}}
{{- $extra := .Values.extraRoutes | default dict -}}
{{- range $key := keys $extra | sortAlpha -}}
{{- $d := get $extra $key | default dict -}}
{{- $group := required (printf "gateway-routes: extraRoutes.%s.group is required" $key) $d.group -}}
{{- $hosts := list -}}
{{- range $d.hosts | default list }}{{ $hosts = append $hosts (tpl (. | toString) $) }}{{ end -}}
{{- if not $hosts -}}
{{- if has $group (list "api" "dashboard" "temporal") -}}
{{- $hosts = include "gateway-routes.hostList" (dict "root" $ "key" $group) | fromJsonArray -}}
{{- else -}}
{{- range $site := concat (include "gateway-routes.dashboardSites" $ | fromJsonArray) (include "gateway-routes.extraSites" $ | fromJsonArray) -}}
{{- if eq $site.group $group }}{{ $hosts = $site.hosts }}{{ end -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- if not $hosts -}}
{{- fail (printf "gateway-routes: extraRoutes.%s: no hostnames for group %q" $key $group) -}}
{{- end -}}
{{- $routes = append $routes (dict "key" $key "group" $group "hosts" $hosts "sectionNames" ($d.sectionNames | default list)
    "matches" (required (printf "gateway-routes: extraRoutes.%s.matches is required" $key) $d.matches)
    "rewrite" ($d.rewrite | default "") "chart" (required (printf "gateway-routes: extraRoutes.%s.chart is required" $key) $d.chart)
    "port" ($d.port | default $.Values.backendServicePort)) -}}
{{- end -}}
{{- toJson $routes -}}
{{- end }}

{{/*
Namespace of a backend that is not a product module (Temporal Web UI:
"temporal", landing page: "landingpage"): only an explicit
backendNamespaces.<key> (tpl-expanded) moves it; backendNamespace does not
apply. Empty = the route's own namespace.
*/}}
{{- define "gateway-routes.explicitBackendNamespace" -}}
{{- $root := .root -}}
{{- $ns := get ($root.Values.backendNamespaces | default dict) .chart | default "" -}}
{{- $ns = tpl ($ns | toString) $root -}}
{{- if and $ns (ne $ns $root.Release.Namespace) -}}
{{- $ns -}}
{{- end -}}
{{- end }}

{{/*
Environment domain, e.g. env1.example.com.
.Values.domain wins; otherwise derived as <stage>.<baseDomain>.
*/}}
{{- define "gateway-routes.domain" -}}
{{- if .Values.domain -}}
{{- tpl (.Values.domain | toString) . -}}
{{- else -}}
{{- $stage := include "gateway-routes.effectiveStageName" . | required "gateway-routes: set .Values.domain or global.stage.name (domain defaults to <stage>.<baseDomain>)" -}}
{{- $base := .Values.baseDomain | required "gateway-routes: .Values.baseDomain must be set when .Values.domain is empty" -}}
{{- printf "%s.%s" $stage $base -}}
{{- end -}}
{{- end }}

{{/*
Per-service hostnames. hosts.{api,dashboard,temporal} is a hostname or a list
of hostnames (default <svc>.<domain>); every hostname is served, the first is
the primary one (OIDC redirect URL, cookie domain, default CORS origin).
Call with: include "gateway-routes.hostList" (dict "root" $ "key" "<svc>") | fromJsonArray
*/}}
{{- define "gateway-routes.hostList" -}}
{{- $root := .root -}}
{{- $h := get ($root.Values.hosts | default dict) .key -}}
{{- $out := list -}}
{{- if kindIs "slice" $h -}}
{{- range $h }}{{ $out = append $out (tpl (. | toString) $root) }}{{ end -}}
{{- else if $h -}}
{{- $out = list (tpl ($h | toString) $root) -}}
{{- else -}}
{{- $out = list (printf "%s.%s" .key (include "gateway-routes.domain" $root)) -}}
{{- end -}}
{{- toJson $out -}}
{{- end }}

{{- define "gateway-routes.apiHost" -}}
{{- include "gateway-routes.hostList" (dict "root" . "key" "api") | fromJsonArray | first -}}
{{- end }}

{{- define "gateway-routes.dashboardHost" -}}
{{- include "gateway-routes.hostList" (dict "root" . "key" "dashboard") | fromJsonArray | first -}}
{{- end }}

{{- define "gateway-routes.temporalHost" -}}
{{- include "gateway-routes.hostList" (dict "root" . "key" "temporal") | fromJsonArray | first -}}
{{- end }}

{{/*
hostnames: list items for a JSON list of hostnames.
*/}}
{{- define "gateway-routes.hostnameItems" -}}
{{- range $i, $h := . }}
{{- if $i }}{{ "\n" }}{{ end -}}
- {{ $h }}
{{- end }}
{{- end }}

{{/*
Gateway listener section names. The shared Gateway defines one listener
pair per environment by default: https-<env> / http-<env> for hostname
*.<domain>. gateway.sectionName / gateway.httpSectionName (a name or a list)
replace the defaults; gateway.sectionNames.<group> (a name or a list) sets the
https sections of one host group (api, dashboard, temporal, or the key of an
extraDashboards / extraSites entry) — for Gateways with listeners per
hostname.
Call with: include "gateway-routes.sectionList" (dict "root" $ "group" "<group>" "http" false) | fromJsonArray
*/}}
{{- define "gateway-routes.sectionList" -}}
{{- $root := .root -}}
{{- $g := $root.Values.gateway -}}
{{- $v := "" -}}
{{- if .http -}}
{{- $v = $g.httpSectionName -}}
{{- else -}}
{{- $v = get ($g.sectionNames | default dict) (.group | default "") | default $g.sectionName -}}
{{- end -}}
{{- $out := list -}}
{{- if kindIs "slice" $v -}}
{{- range $v }}{{ $out = append $out (tpl (. | toString) $root) }}{{ end -}}
{{- else if $v -}}
{{- $out = list (tpl ($v | toString) $root) -}}
{{- else -}}
{{- $stage := include "gateway-routes.effectiveStageName" $root | required (printf "gateway-routes: set gateway.%s or global.stage.name" (ternary "httpSectionName" "sectionName" (.http | default false))) -}}
{{- $out = list (printf "%s-%s" (ternary "http" "https" (.http | default false)) $stage) -}}
{{- end -}}
{{- toJson $out -}}
{{- end }}

{{- define "gateway-routes.httpsSectionName" -}}
{{- include "gateway-routes.sectionList" (dict "root" . "group" "") | fromJsonArray | first -}}
{{- end }}

{{- define "gateway-routes.httpSectionName" -}}
{{- include "gateway-routes.sectionList" (dict "root" . "http" true) | fromJsonArray | first -}}
{{- end }}

{{/*
parentRefs of the HTTPS routes of a host group (Gateway in another namespace;
attachment is authorized by the Gateway listener's allowedRoutes namespace
selector, NOT by a ReferenceGrant — see README.md): one entry per listener
section.
Call with: include "gateway-routes.groupParentRefs" (dict "root" $ "group" "<group>")
*/}}
{{- define "gateway-routes.groupParentRefs" -}}
{{- $root := .root -}}
{{- if $root.Values.listenerSet.enabled -}}
- group: gateway.networking.k8s.io
  kind: ListenerSet
  name: {{ include "gateway-routes.listenerSetName" $root }}
  sectionName: https
{{- else -}}
{{- range $i, $section := include "gateway-routes.sectionList" (dict "root" $root "group" .group) | fromJsonArray }}
{{- if $i }}{{ "\n" }}{{ end -}}
- name: {{ $root.Values.gateway.name }}
  namespace: {{ $root.Values.gateway.namespace }}
  sectionName: {{ $section }}
{{- end -}}
{{- end -}}
{{- end }}

{{/*
parentRefs of the HTTPS routes with the default sections.
*/}}
{{- define "gateway-routes.parentRefs" -}}
{{- include "gateway-routes.groupParentRefs" (dict "root" . "group" "") -}}
{{- end }}

{{/*
parentRefs of the http -> https redirect route: one entry per http section.
*/}}
{{- define "gateway-routes.httpParentRefs" -}}
{{- if .Values.listenerSet.enabled -}}
- group: gateway.networking.k8s.io
  kind: ListenerSet
  name: {{ include "gateway-routes.listenerSetName" . }}
  sectionName: http
{{- else -}}
{{- range $i, $section := include "gateway-routes.sectionList" (dict "root" $ "http" true) | fromJsonArray }}
{{- if $i }}{{ "\n" }}{{ end -}}
- name: {{ $.Values.gateway.name }}
  namespace: {{ $.Values.gateway.namespace }}
  sectionName: {{ $section }}
{{- end -}}
{{- end -}}
{{- end }}

{{/*
ListenerSet mode: name, hostname and TLS Secret of the environment's own
listeners.
*/}}
{{- define "gateway-routes.listenerSetName" -}}
{{- .Values.listenerSet.name | default "gateway-listeners" -}}
{{- end }}

{{- define "gateway-routes.listenerSetHostname" -}}
{{- with .Values.listenerSet.hostname -}}
{{- tpl (. | toString) $ -}}
{{- else -}}
{{- printf "*.%s" (include "gateway-routes.domain" .) -}}
{{- end -}}
{{- end }}

{{- define "gateway-routes.listenerSetSecretName" -}}
{{- .Values.listenerSet.tls.secretName | default (printf "%s-tls" (include "gateway-routes.listenerSetName" .)) -}}
{{- end }}

{{/*
Keycloak realm: auth.realm wins, else the stage name (one realm per environment).
*/}}
{{- define "gateway-routes.realm" -}}
{{- $a := .Values.auth | default dict -}}
{{- if $a.realm -}}
{{- tpl ($a.realm | toString) . -}}
{{- else -}}
{{- include "gateway-routes.effectiveStageName" . | required "gateway-routes: set auth.realm or global.stage.name" -}}
{{- end -}}
{{- end }}

{{/*
Keycloak issuer URL for the env realm.
*/}}
{{- define "gateway-routes.keycloakIssuer" -}}
{{- printf "https://%s/realms/%s" (include "gateway-routes.keycloakHost" .) (include "gateway-routes.realm" .) -}}
{{- end }}

{{/*
CORS allowOrigins list items. cors.allowOrigins wins when non-empty; default is
every dashboard origin of the environment: https://<host> for each hostname
of hosts.dashboard and of the extraDashboards.
*/}}
{{- define "gateway-routes.corsAllowOrigins" -}}
{{- $c := .Values.cors | default dict -}}
{{- $origins := $c.allowOrigins | default list -}}
{{- if not $origins -}}
{{- range $site := include "gateway-routes.dashboardSites" . | fromJsonArray -}}
{{- range $site.hosts -}}
{{- $origins = append $origins (printf "https://%s" .) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- range $origins }}
- {{ tpl (. | toString) $ | quote }}
{{- end }}
{{- end }}

{{/*
Dashboard sites: the environment's dashboard (hosts.dashboard, routes
dashboard-*, policy oidc-policy) followed by every extraDashboards entry
(sorted by key; routes <key>-*, policy <key>-oidc-policy). Each site serves
the dashboard SPA from its frontend chart and the dashboard /api proxies.
Fields: key, prefix, policy, group, hosts, frontendChart, landing, oidc.
*/}}
{{- define "gateway-routes.dashboardSites" -}}
{{- $sites := list (dict "key" "dashboard" "prefix" "dashboard" "policy" "oidc-policy" "group" "dashboard"
    "hosts" (include "gateway-routes.hostList" (dict "root" . "key" "dashboard") | fromJsonArray)
    "frontendChart" "frontend" "landing" true "oidc" .Values.oidc.dashboard) -}}
{{- $extra := .Values.extraDashboards | default dict -}}
{{- range $key := keys $extra | sortAlpha -}}
{{- $d := get $extra $key | default dict -}}
{{- $hosts := list -}}
{{- range $d.hosts | default list }}{{ $hosts = append $hosts (tpl (. | toString) $) }}{{ end -}}
{{- if not $hosts -}}
{{- fail (printf "gateway-routes: extraDashboards.%s.hosts is required" $key) -}}
{{- end -}}
{{- $oidc := mergeOverwrite (deepCopy $.Values.oidc.dashboard)
    (dict "cookieNames" (dict "accessToken" (printf "%s_access_token" $key) "idToken" (printf "%s_id_token" $key)))
    ($d.oidc | default dict) -}}
{{- $sites = append $sites (dict "key" $key "prefix" $key "policy" (printf "%s-oidc-policy" $key) "group" $key
    "hosts" $hosts "frontendChart" (($d.frontend | default dict).chart | default "frontend")
    "landing" (eq (toString $d.landing) "true") "oidc" $oidc) -}}
{{- end -}}
{{- toJson $sites -}}
{{- end }}

{{/*
Extra sites (extraSites): one host group each, everything under / routed to
one backend chart's Service behind its own OIDC session.
Fields: key, group, hosts, chart, port, oidc.
*/}}
{{- define "gateway-routes.extraSites" -}}
{{- $sites := list -}}
{{- $extra := .Values.extraSites | default dict -}}
{{- range $key := keys $extra | sortAlpha -}}
{{- $d := get $extra $key | default dict -}}
{{- $hosts := list -}}
{{- range $d.hosts | default list }}{{ $hosts = append $hosts (tpl (. | toString) $) }}{{ end -}}
{{- if not $hosts -}}
{{- fail (printf "gateway-routes: extraSites.%s.hosts is required" $key) -}}
{{- end -}}
{{- $chart := required (printf "gateway-routes: extraSites.%s.chart is required" $key) $d.chart -}}
{{- $oidc := mergeOverwrite (deepCopy $.Values.oidc.temporal)
    (dict "cookieNames" (dict "accessToken" (printf "%s_access_token" $key) "idToken" (printf "%s_id_token" $key)))
    ($d.oidc | default dict) -}}
{{- $sites = append $sites (dict "key" $key "group" $key "hosts" $hosts "chart" $chart
    "port" ($d.port | default $.Values.backendServicePort) "oidc" $oidc) -}}
{{- end -}}
{{- toJson $sites -}}
{{- end }}

{{/*
Temporal Web UI Service name. The upstream temporal chart (wrapped by
04-shared-services/temporal) names the UI service <release>-temporal-web;
override .Values.temporalWebService if the wrapper chart renders a different name.
*/}}
{{- define "gateway-routes.temporalWebService" -}}
{{- if .Values.temporalWebService -}}
{{- tpl (.Values.temporalWebService | toString) . -}}
{{- else -}}
{{- printf "%s-temporal-web" .Release.Name -}}
{{- end -}}
{{- end }}

{{/*
Landing-page Service name. Default is the landingpage chart's Service
({release}-landingpage-<stage>, chart 01-frontend/landingpage — deployed as a
spark-platform umbrella sibling subchart); .Values.landing.service overrides.
Envs without a landing deployment set landing.enabled=false, which
auto-redirects the apex to /app.
*/}}
{{- define "gateway-routes.landingService" -}}
{{- $l := .Values.landing | default dict -}}
{{- if $l.service -}}
{{- tpl ($l.service | toString) . -}}
{{- else -}}
{{- include "gateway-routes.backendName" (dict "root" . "chart" "landingpage") -}}
{{- end -}}
{{- end }}

{{/*
Common labels applied to all resources.
*/}}
{{- define "gateway-routes.labels" -}}
helm.sh/chart: {{ include "gateway-routes.chart" . }}
app.kubernetes.io/name: {{ include "gateway-routes.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- $environment := include "gateway-routes.effectiveStageName" . }}
{{- if $environment }}
environment: {{ $environment | quote }}
{{- end }}
{{- end }}

{{/*
Keycloak host (auth.keycloakHost): required — the issuer every token is
checked against.
*/}}
{{- define "gateway-routes.keycloakHost" -}}
{{- required "gateway-routes: auth.keycloakHost is required (the Keycloak serving the realm)" .Values.auth.keycloakHost -}}
{{- end }}
