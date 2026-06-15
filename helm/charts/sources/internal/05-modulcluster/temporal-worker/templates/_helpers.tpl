{{/*
DNS-safe chart name (lowercase, dots → hyphens).
When nameOverride is set it replaces Chart.Name, preserving the legacy
modul-<name> naming used in all deployment selectors and labels.
*/}}
{{- define "temporal-worker.chartName" -}}
{{- $n := default .Chart.Name .Values.nameOverride | toString -}}
{{- $n | lower | replace "." "-" | trunc 53 | trimSuffix "-" -}}
{{- end }}

{{/*
Expand the name of the chart (app.kubernetes.io/name label).
*/}}
{{- define "temporal-worker.name" -}}
{{- include "temporal-worker.chartName" . -}}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
*/}}
{{- define "temporal-worker.effectiveStageName" -}}
{{- $local := .Values.stage | default dict -}}
{{- $gst := (.Values.global | default dict).stage | default dict -}}
{{- if $local.name -}}
{{- $local.name | toString -}}
{{- else if $gst.name -}}
{{- $gst.name | toString -}}
{{- end -}}
{{- end }}

{{/*
Environment label value: stage name, else global.labels.environment, else chart labels.environment.
*/}}
{{- define "temporal-worker.environmentLabel" -}}
{{- $sn := include "temporal-worker.effectiveStageName" . -}}
{{- if $sn -}}
{{- $sn -}}
{{- else -}}
{{- $g := (.Values.global | default dict).labels | default dict -}}
{{- $l := .Values.labels | default dict -}}
{{- default "" (default $l.environment $g.environment) -}}
{{- end -}}
{{- end }}

{{/*
Stage suffix appended to resource names (e.g. "-dev"). Empty when no stage is set.
*/}}
{{- define "temporal-worker.stageSuffix" -}}
{{- $sn := include "temporal-worker.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Base name: {Release.Name}-{chartName}.
Always includes both parts so resource names are predictable regardless of release name.
*/}}
{{- define "temporal-worker.fullnameBase" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "temporal-worker.chartName" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Fully qualified resource name: {Release.Name}-{chartName}[-{stage}].
When fullnameOverride is set the stage suffix is not appended.
*/}}
{{- define "temporal-worker.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- include "temporal-worker.fullnameBase" . -}}
{{- else }}
{{- $base := include "temporal-worker.fullnameBase" . -}}
{{- $suffix := include "temporal-worker.stageSuffix" . -}}
{{- printf "%s%s" $base $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Chart name and version used for the helm.sh/chart label.
*/}}
{{- define "temporal-worker.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to all resources and pod templates.
Merge order (lowest → highest priority):
  global.labels  →  values.labels  →  stage-derived environment
All key-value pairs flow through as-is — no specific keys are required.
*/}}
{{- define "temporal-worker.labels" -}}
helm.sh/chart: {{ include "temporal-worker.chart" . }}
{{ include "temporal-worker.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- $gl := (.Values.global | default dict).labels | default dict -}}
{{- $l  := .Values.labels | default dict -}}
{{- $merged := merge (deepCopy $l) $gl -}}
{{- $env := include "temporal-worker.environmentLabel" . -}}
{{- if $env }}{{- $_ := set $merged "environment" $env -}}{{- end }}
{{- if $merged }}
{{ toYaml $merged | trim }}
{{- end }}
{{- end }}

{{/*
Merge resource-level annotations: global.annotations → values.annotations (local wins).
*/}}
{{- define "temporal-worker.mergedAnnotations" -}}
{{- $g := (.Values.global | default dict) -}}
{{- $merged := merge (.Values.annotations | default dict) ($g.annotations | default dict) -}}
{{- if $merged }}{{ toYaml $merged }}{{- end }}
{{- end }}

{{/*
Merge pod-template annotations: global.podAnnotations → values.podAnnotations (local wins).
*/}}
{{- define "temporal-worker.mergedPodAnnotations" -}}
{{- $g := (.Values.global | default dict) -}}
{{- $merged := merge (.Values.podAnnotations | default dict) ($g.podAnnotations | default dict) -}}
{{- if $merged }}{{ toYaml $merged }}{{- end }}
{{- end }}

{{/*
Merge pod-template labels: global.podLabels → values.podLabels (local wins).
Appended after the standard labels block in the pod template.
*/}}
{{- define "temporal-worker.mergedPodLabels" -}}
{{- $g := (.Values.global | default dict) -}}
{{- $merged := merge (.Values.podLabels | default dict) ($g.podLabels | default dict) -}}
{{- if $merged }}{{ toYaml $merged }}{{- end }}
{{- end }}

{{/*
Selector labels used by Service.spec.selector and Deployment.spec.selector.matchLabels.
Instance equals fullname so each alias in a multi-worker release has a unique selector.
*/}}
{{- define "temporal-worker.selectorLabels" -}}
app.kubernetes.io/name: {{ include "temporal-worker.name" . }}
app.kubernetes.io/instance: {{ include "temporal-worker.fullname" . }}
{{- end }}

{{/*
Name of the ServiceAccount to use.
*/}}
{{- define "temporal-worker.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "temporal-worker.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Workload namespace: Values.namespaceOverride when set, else Release.Namespace.
*/}}
{{- define "temporal-worker.namespace" -}}
{{- $ns := .Values.namespaceOverride | default "" | toString | trim -}}
{{- if $ns -}}
{{- $ns -}}
{{- else -}}
{{- .Release.Namespace | default "default" -}}
{{- end -}}
{{- end }}

{{/*
Merged container env (lowest → highest precedence): global.env, global.extraEnv, env, extraEnv.
Values containing "{{" are expanded via tpl at render time to support in-cluster FQDN templates.
*/}}
{{- define "temporal-worker.containerEnv" -}}
{{- $g := .Values.global | default dict -}}
{{- $envMap := dict }}
{{- range concat ($g.env | default list) ($g.extraEnv | default list) (.Values.env | default list) (.Values.extraEnv | default list) }}
{{- $out := dict "name" .name }}
{{- if .valueFrom }}
{{- $_ := set $out "valueFrom" .valueFrom }}
{{- else if and (kindIs "string" .value) (contains "{{" (.value | toString)) }}
{{- $_ := set $out "value" (tpl (.value | toString) $ | trim) }}
{{- else if not (kindIs "invalid" .value) }}
{{- $_ := set $out "value" .value }}
{{- end }}
{{- $_ := set $envMap .name $out }}
{{- end }}
{{- if $envMap }}{{ toYaml (values $envMap) }}{{ end }}
{{- end }}

{{/*
Temporal frontend gRPC address (port 7233).
Format: {release}-temporal{stage}-frontend.{namespace}.svc.cluster.local:7233
*/}}
{{- define "temporal-worker.temporalFrontendFQDN" -}}
{{- printf "%s-temporal%s-frontend.%s.svc.cluster.local:7233" .Release.Name (include "temporal-worker.stageSuffix" .) (include "temporal-worker.namespace" .) -}}
{{- end }}

{{/*
Qdrant vector database base URL (HTTP, port 6333).
Format: http://{release}-qdrant{stage}.{namespace}.svc.cluster.local:6333
*/}}
{{- define "temporal-worker.qdrantBaseUrl" -}}
{{- printf "http://%s-qdrant%s.%s.svc.cluster.local:6333" .Release.Name (include "temporal-worker.stageSuffix" .) (include "temporal-worker.namespace" .) -}}
{{- end }}

{{/*
Qdrant hostname without protocol or port (used by suche-und-zuordnung QDRANT_HOST).
Format: {release}-qdrant{stage}.{namespace}.svc.cluster.local
*/}}
{{- define "temporal-worker.qdrantHost" -}}
{{- printf "%s-qdrant%s.%s.svc.cluster.local" .Release.Name (include "temporal-worker.stageSuffix" .) (include "temporal-worker.namespace" .) -}}
{{- end }}

{{/*
CNPG transaction pooler read-write hostname (used by rechtsmethodik).
Format: {release}-cnpg-postgres{stage}-pooler-rw.{namespace}.svc.cluster.local
*/}}
{{- define "temporal-worker.cnpgPoolerFQDN" -}}
{{- printf "%s-cnpg-postgres%s-pooler-rw.%s.svc.cluster.local" .Release.Name (include "temporal-worker.stageSuffix" .) (include "temporal-worker.namespace" .) -}}
{{- end }}

{{/*
Document Management Service base URL (used by bewertung, einwendungsmanagement, formale-pruefung, plausibilitaet-pruefung).
Format: http://{release}-document-management-service{stage}.{namespace}.svc.cluster.local
*/}}
{{- define "temporal-worker.dmsBaseUrl" -}}
{{- printf "http://%s-document-management-service%s.%s.svc.cluster.local" .Release.Name (include "temporal-worker.stageSuffix" .) (include "temporal-worker.namespace" .) -}}
{{- end }}
