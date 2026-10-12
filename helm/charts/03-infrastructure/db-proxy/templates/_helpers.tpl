{{/*
DNS-safe chart name (lowercase, dots → hyphens).
*/}}
{{- define "db-proxy.chartName" -}}
{{- $n := default .Chart.Name .Values.nameOverride | toString -}}
{{- $n | lower | replace "." "-" | trunc 53 | trimSuffix "-" -}}
{{- end }}

{{- define "db-proxy.name" -}}
{{- include "db-proxy.chartName" . -}}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
*/}}
{{- define "db-proxy.effectiveStageName" -}}
{{- $local := .Values.stage | default dict -}}
{{- $gst := (.Values.global | default dict).stage | default dict -}}
{{- if $local.name -}}
{{- $local.name | toString -}}
{{- else if $gst.name -}}
{{- $gst.name | toString -}}
{{- end -}}
{{- end }}

{{/*
Stage suffix appended to resource names (e.g. "-my-env"). Empty when no stage is set.
*/}}
{{- define "db-proxy.stageSuffix" -}}
{{- $sn := include "db-proxy.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Fully qualified name: {Release.Name}-{chart.name}-{stage.name}; fullnameOverride
replaces it (without stage suffix).
*/}}
{{- define "db-proxy.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $base := printf "%s-%s" .Release.Name (include "db-proxy.chartName" .) | trunc 63 | trimSuffix "-" -}}
{{- printf "%s%s" $base (include "db-proxy.stageSuffix" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Component names: <component>.name, else <fullname>-<suffix>.
Call with: include "db-proxy.componentName" (dict "root" $ "name" .Values.x.name "suffix" "x")
*/}}
{{- define "db-proxy.componentName" -}}
{{- if .name -}}
{{- tpl (.name | toString) .root | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" (include "db-proxy.fullname" .root) .suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{- define "db-proxy.cloudSqlProxyName" -}}
{{- include "db-proxy.componentName" (dict "root" . "name" .Values.cloudSqlProxy.name "suffix" "cloudsql-proxy") -}}
{{- end }}

{{- define "db-proxy.pgbouncerName" -}}
{{- include "db-proxy.componentName" (dict "root" . "name" .Values.pgbouncer.name "suffix" "pgbouncer") -}}
{{- end }}

{{- define "db-proxy.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels. Call with: include "db-proxy.labels" (dict "root" $ "component" "<component>")
*/}}
{{- define "db-proxy.labels" -}}
helm.sh/chart: {{ include "db-proxy.chart" .root }}
{{ include "db-proxy.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
{{- $environment := include "db-proxy.effectiveStageName" .root }}
{{- if $environment }}
environment: {{ $environment | quote }}
{{- end }}
{{- end }}

{{/*
Selector labels of one component.
*/}}
{{- define "db-proxy.selectorLabels" -}}
app.kubernetes.io/name: {{ include "db-proxy.name" .root }}
app.kubernetes.io/instance: {{ include "db-proxy.fullname" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Namespace: namespaceOverride > global.namespaceOverride > release namespace.
*/}}
{{- define "db-proxy.namespace" -}}
{{- $ns := .Values.namespaceOverride | default "" | toString | trim -}}
{{- $gns := ((.Values.global | default dict).namespaceOverride) | default "" | toString | trim -}}
{{- coalesce $ns $gns .Release.Namespace "default" -}}
{{- end }}

{{/*
ServiceAccount name: serviceAccount.name, else the fullname when this chart
creates it, else "default".
*/}}
{{- define "db-proxy.serviceAccountName" -}}
{{- if .Values.serviceAccount.name -}}
{{- .Values.serviceAccount.name -}}
{{- else if .Values.serviceAccount.create -}}
{{- include "db-proxy.fullname" . -}}
{{- else -}}
default
{{- end -}}
{{- end }}

{{/*
Pod imagePullSecrets: global.imagePullSecrets followed by imagePullSecrets,
de-duplicated by name.
*/}}
{{- define "db-proxy.imagePullSecrets" -}}
{{- $seen := dict -}}
{{- $out := list -}}
{{- range concat (((.Values.global | default dict).imagePullSecrets) | default list) (.Values.imagePullSecrets | default list) -}}
{{- $n := "" -}}
{{- if kindIs "string" . -}}{{- $n = . -}}{{- else if kindIs "map" . -}}{{- $n = .name | default "" -}}{{- end -}}
{{- if and $n (not (hasKey $seen $n)) -}}
{{- $_ := set $seen $n true -}}
{{- $out = append $out (dict "name" $n) -}}
{{- end -}}
{{- end -}}
{{- with $out -}}
{{- toYaml . -}}
{{- end -}}
{{- end }}

{{/*
Image reference of a component: [registry/]repository:tag[@digest]. registry:
image.registry, else global.imageRegistry when the repository names no
registry itself. Call with: include "db-proxy.image" (dict "root" $ "image" .Values.x.image)
*/}}
{{- define "db-proxy.image" -}}
{{- $img := .image -}}
{{- $g := .root.Values.global | default dict -}}
{{- $repo := $img.repository | toString -}}
{{- $first := first (splitList "/" $repo) -}}
{{- $hasHost := and (contains "/" $repo) (or (contains "." $first) (contains ":" $first) (hasPrefix "<" $first) (eq $first "localhost")) -}}
{{- $registry := $img.registry | default "" -}}
{{- if and (not $registry) (not $hasHost) -}}
{{- $registry = $g.imageRegistry | default "" -}}
{{- end -}}
{{- $ref := ternary (printf "%s/%s" (trimSuffix "/" $registry) $repo) $repo (ne $registry "") -}}
{{- if $img.digest -}}
{{- printf "%s:%s@%s" $ref (toString $img.tag) $img.digest -}}
{{- else -}}
{{- printf "%s:%s" $ref (toString $img.tag) -}}
{{- end -}}
{{- end }}

{{/*
Pod spec fields shared by both components: pull secrets, ServiceAccount,
security context, scheduling. Call with: include "db-proxy.podCommon" (dict "root" $ "component" "<c>" "values" .Values.<c> "extraPodSecurity" (dict ...))
*/}}
{{- define "db-proxy.podCommon" -}}
{{- $root := .root -}}
{{- with include "db-proxy.imagePullSecrets" $root }}
imagePullSecrets:
  {{- . | nindent 2 }}
{{- end }}
serviceAccountName: {{ include "db-proxy.serviceAccountName" $root }}
automountServiceAccountToken: false
securityContext:
  {{- toYaml (mergeOverwrite (deepCopy ($root.Values.podSecurityContext | default dict)) (.extraPodSecurity | default dict) (.values.podSecurityContext | default dict)) | nindent 2 }}
{{- if .values.spreadAcrossNodes }}
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        {{- include "db-proxy.selectorLabels" (dict "root" $root "component" .component) | nindent 8 }}
{{- end }}
{{- with $root.Values.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $root.Values.affinity }}
affinity:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with $root.Values.tolerations }}
tolerations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end }}

{{/*
Container securityContext of a component.
*/}}
{{- define "db-proxy.containerSecurity" -}}
{{- toYaml (mergeOverwrite (deepCopy (.root.Values.securityContext | default dict)) (.values.securityContext | default dict)) -}}
{{- end }}

{{/*
Pod template metadata of a component.
*/}}
{{- define "db-proxy.podMetadata" -}}
{{- $ann := merge (deepCopy (.annotations | default dict)) (.root.Values.podAnnotations | default dict) -}}
{{- with $ann }}
annotations:
  {{- toYaml . | nindent 2 }}
{{- end }}
labels:
  {{- include "db-proxy.labels" (dict "root" .root "component" .component) | nindent 2 }}
  {{- with .root.Values.podLabels }}
  {{- toYaml . | nindent 2 }}
  {{- end }}
{{- end }}

{{/*
PodDisruptionBudget of a component.
*/}}
{{- define "db-proxy.pdb" -}}
{{- if and .values.podDisruptionBudget.enabled (gt (int .values.replicaCount) 1) }}
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ .name }}
  namespace: {{ include "db-proxy.namespace" .root }}
  labels:
    {{- include "db-proxy.labels" (dict "root" .root "component" .component) | nindent 4 }}
spec:
  minAvailable: {{ .values.podDisruptionBudget.minAvailable }}
  selector:
    matchLabels:
      {{- include "db-proxy.selectorLabels" (dict "root" .root "component" .component) | nindent 6 }}
{{- end }}
{{- end }}

{{/*
PgBouncer configuration (pgbouncer.ini). Call with: include "db-proxy.pgbouncerIni" (dict "values" .Values.pgbouncer "host" <server host>)
*/}}
{{- define "db-proxy.pgbouncerIni" -}}
{{- $v := .values -}}
[databases]
* = host={{ .host }} port={{ $v.server.port }}

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = {{ $v.port }}
unix_socket_dir =
auth_type = {{ $v.auth.type }}
auth_file = /etc/pgbouncer/auth/{{ $v.auth.key }}
pool_mode = {{ $v.poolMode }}
max_client_conn = {{ $v.maxClientConn }}
default_pool_size = {{ $v.defaultPoolSize }}
server_tls_sslmode = {{ $v.server.sslmode }}
client_tls_sslmode = disable
ignore_startup_parameters = {{ join "," $v.ignoreStartupParameters }}
server_idle_timeout = {{ $v.serverIdleTimeout }}
log_connections = {{ ternary 1 0 $v.logConnections }}
log_disconnections = {{ ternary 1 0 $v.logConnections }}
{{- range $k, $val := $v.extraSettings }}
{{ $k }} = {{ $val }}
{{- end }}
{{- end }}
