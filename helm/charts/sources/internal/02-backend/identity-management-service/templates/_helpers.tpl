{{/*
DNS-safe chart name (lowercase, dots → hyphens).
*/}}
{{- define "identity-management-service.chartName" -}}
{{- $n := default .Chart.Name .Values.nameOverride | toString -}}
{{- $n | lower | replace "." "-" | trunc 53 | trimSuffix "-" -}}
{{- end }}

{{/*
Expand the name of the chart (app.kubernetes.io/name label).
*/}}
{{- define "identity-management-service.name" -}}
{{- include "identity-management-service.chartName" . -}}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
*/}}
{{- define "identity-management-service.effectiveStageName" -}}
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
{{- define "identity-management-service.environmentLabel" -}}
{{- $sn := include "identity-management-service.effectiveStageName" . -}}
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
{{- define "identity-management-service.stageSuffix" -}}
{{- $sn := include "identity-management-service.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Base name: {Release.Name}-{chart.name}.
Always includes both parts so resource names are predictable regardless of release name.
*/}}
{{- define "identity-management-service.fullnameBase" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "identity-management-service.chartName" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Fully qualified resource name: {Release.Name}-{chart.name}-{stage.name}.
When fullnameOverride is set the stage suffix is not appended.
*/}}
{{- define "identity-management-service.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- include "identity-management-service.fullnameBase" . -}}
{{- else }}
{{- $base := include "identity-management-service.fullnameBase" . -}}
{{- $suffix := include "identity-management-service.stageSuffix" . -}}
{{- printf "%s%s" $base $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Chart name and version used for the helm.sh/chart label.
*/}}
{{- define "identity-management-service.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to all resources and pod templates.
Merge order (lowest → highest priority):
  global.labels  →  values.labels  →  stage-derived environment
All key-value pairs flow through as-is — no specific keys are required.
*/}}
{{- define "identity-management-service.labels" -}}
helm.sh/chart: {{ include "identity-management-service.chart" . }}
{{ include "identity-management-service.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- $gl := (.Values.global | default dict).labels | default dict -}}
{{- $l  := .Values.labels | default dict -}}
{{- $merged := merge (deepCopy $l) $gl -}}
{{- $env := include "identity-management-service.environmentLabel" . -}}
{{- if $env }}{{- $_ := set $merged "environment" $env -}}{{- end }}
{{- if $merged }}
{{ toYaml $merged | trim }}
{{- end }}
{{- end }}

{{/*
Merge resource-level annotations: global.annotations → values.annotations (local wins).
*/}}
{{- define "identity-management-service.mergedAnnotations" -}}
{{- $g := (.Values.global | default dict) -}}
{{- $merged := merge (.Values.annotations | default dict) ($g.annotations | default dict) -}}
{{- if $merged }}{{ toYaml $merged }}{{- end }}
{{- end }}

{{/*
Merge pod-template annotations: global.podAnnotations → values.podAnnotations (local wins).
*/}}
{{- define "identity-management-service.mergedPodAnnotations" -}}
{{- $g := (.Values.global | default dict) -}}
{{- $merged := merge (.Values.podAnnotations | default dict) ($g.podAnnotations | default dict) -}}
{{- if $merged }}{{ toYaml $merged }}{{- end }}
{{- end }}

{{/*
Merge pod-template labels: global.podLabels → values.podLabels (local wins).
Appended after the standard labels block in the pod template.
*/}}
{{- define "identity-management-service.mergedPodLabels" -}}
{{- $g := (.Values.global | default dict) -}}
{{- $merged := merge (.Values.podLabels | default dict) ($g.podLabels | default dict) -}}
{{- if $merged }}{{ toYaml $merged }}{{- end }}
{{- end }}

{{/*
Selector labels used by Service.spec.selector and Deployment.spec.selector.matchLabels.
instance equals fullname so each chart in a multi-chart release has a unique selector.
*/}}
{{- define "identity-management-service.selectorLabels" -}}
app.kubernetes.io/name: {{ include "identity-management-service.name" . }}
app.kubernetes.io/instance: {{ include "identity-management-service.fullname" . }}
{{- end }}

{{/*
Name of the ServiceAccount to use.
*/}}
{{- define "identity-management-service.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "identity-management-service.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Workload namespace: Values.namespaceOverride when set, else Release.Namespace.
*/}}
{{- define "identity-management-service.namespace" -}}
{{- $ns := .Values.namespaceOverride | default "" | toString | trim -}}
{{- if $ns -}}
{{- $ns -}}
{{- else -}}
{{- .Release.Namespace | default "default" -}}
{{- end -}}
{{- end }}

{{/*
Merged container env (lowest → highest precedence): global.env, env, global.extraEnv, extraEnv.
Values containing "{{" are expanded via tpl at render time.
*/}}
{{- define "identity-management-service.containerEnv" -}}
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
CNPG transaction pooler read-write hostname.
Format: {release}-cnpg-postgres{stage}-pooler-rw.{namespace}.svc.cluster.local
*/}}
{{- define "identity-management-service.cnpgPoolerFQDN" -}}
{{- printf "%s-cnpg-postgres%s-pooler-rw.%s.svc.cluster.local" .Release.Name (include "identity-management-service.stageSuffix" .) (include "identity-management-service.namespace" .) -}}
{{- end }}
