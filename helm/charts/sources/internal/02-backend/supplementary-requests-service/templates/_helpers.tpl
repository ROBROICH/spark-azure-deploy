{{/*
DNS-safe chart name (lowercase, dots → hyphens).
*/}}
{{- define "supplementary-requests-service.chartName" -}}
{{- $n := default .Chart.Name .Values.nameOverride | toString -}}
{{- $n | lower | replace "." "-" | trunc 53 | trimSuffix "-" -}}
{{- end }}

{{/*
Expand the name of the chart (app.kubernetes.io/name label).
*/}}
{{- define "supplementary-requests-service.name" -}}
{{- include "supplementary-requests-service.chartName" . -}}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
*/}}
{{- define "supplementary-requests-service.effectiveStageName" -}}
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
{{- define "supplementary-requests-service.environmentLabel" -}}
{{- $sn := include "supplementary-requests-service.effectiveStageName" . -}}
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
{{- define "supplementary-requests-service.stageSuffix" -}}
{{- $sn := include "supplementary-requests-service.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Base name: {Release.Name}-{chart.name}.
Always includes both parts so resource names are predictable regardless of release name.
*/}}
{{- define "supplementary-requests-service.fullnameBase" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "supplementary-requests-service.chartName" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Fully qualified resource name: {Release.Name}-{chart.name}-{stage.name}.
When fullnameOverride is set the stage suffix is not appended.
*/}}
{{- define "supplementary-requests-service.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- include "supplementary-requests-service.fullnameBase" . -}}
{{- else }}
{{- $base := include "supplementary-requests-service.fullnameBase" . -}}
{{- $suffix := include "supplementary-requests-service.stageSuffix" . -}}
{{- printf "%s%s" $base $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Chart name and version used for the helm.sh/chart label.
*/}}
{{- define "supplementary-requests-service.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to all resources and pod templates.
Merge order (lowest → highest priority):
  global.labels  →  values.labels  →  stage-derived environment
All key-value pairs flow through as-is — no specific keys are required.
*/}}
{{- define "supplementary-requests-service.labels" -}}
helm.sh/chart: {{ include "supplementary-requests-service.chart" . }}
{{ include "supplementary-requests-service.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- $gl := (.Values.global | default dict).labels | default dict -}}
{{- $l  := .Values.labels | default dict -}}
{{- $merged := merge (deepCopy $l) $gl -}}
{{- $env := include "supplementary-requests-service.environmentLabel" . -}}
{{- if $env }}{{- $_ := set $merged "environment" $env -}}{{- end }}
{{- if $merged }}
{{ toYaml $merged | trim }}
{{- end }}
{{- end }}

{{/*
Merge resource-level annotations: global.annotations → values.annotations (local wins).
*/}}
{{- define "supplementary-requests-service.mergedAnnotations" -}}
{{- $g := (.Values.global | default dict) -}}
{{- $merged := merge (.Values.annotations | default dict) ($g.annotations | default dict) -}}
{{- if $merged }}{{ toYaml $merged }}{{- end }}
{{- end }}

{{/*
Merge pod-template annotations: global.podAnnotations → values.podAnnotations (local wins).
*/}}
{{- define "supplementary-requests-service.mergedPodAnnotations" -}}
{{- $g := (.Values.global | default dict) -}}
{{- $merged := merge (.Values.podAnnotations | default dict) ($g.podAnnotations | default dict) -}}
{{- if $merged }}{{ toYaml $merged }}{{- end }}
{{- end }}

{{/*
Merge pod-template labels: global.podLabels → values.podLabels (local wins).
Appended after the standard labels block in the pod template.
*/}}
{{- define "supplementary-requests-service.mergedPodLabels" -}}
{{- $g := (.Values.global | default dict) -}}
{{- $merged := merge (.Values.podLabels | default dict) ($g.podLabels | default dict) -}}
{{- if $merged }}{{ toYaml $merged }}{{- end }}
{{- end }}

{{/*
Selector labels used by Service.spec.selector and Deployment.spec.selector.matchLabels.
instance equals fullname so each chart in a multi-chart release has a unique selector.
*/}}
{{- define "supplementary-requests-service.selectorLabels" -}}
app.kubernetes.io/name: {{ include "supplementary-requests-service.name" . }}
app.kubernetes.io/instance: {{ include "supplementary-requests-service.fullname" . }}
{{- end }}

{{/*
Name of the ServiceAccount to use.
*/}}
{{- define "supplementary-requests-service.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "supplementary-requests-service.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Workload namespace: Values.namespaceOverride when set, else Release.Namespace.
*/}}
{{- define "supplementary-requests-service.namespace" -}}
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
{{- define "supplementary-requests-service.containerEnv" -}}
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
{{- define "supplementary-requests-service.cnpgPoolerFQDN" -}}
{{- printf "%s-cnpg-postgres%s-pooler-rw.%s.svc.cluster.local" .Release.Name (include "supplementary-requests-service.stageSuffix" .) (include "supplementary-requests-service.namespace" .) -}}
{{- end }}
