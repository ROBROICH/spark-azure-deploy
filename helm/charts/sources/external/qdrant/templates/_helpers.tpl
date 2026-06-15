{{/*
Workload namespace: Values.namespaceOverride when set, else Release.Namespace.
Used by any wrapper-level templates in this chart.
*/}}
{{- define "qdrant.namespace" -}}
{{- $ns := .Values.namespaceOverride | default "" | toString | trim -}}
{{- if $ns -}}
{{- $ns -}}
{{- else -}}
{{- .Release.Namespace | default "default" -}}
{{- end -}}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
*/}}
{{- define "qdrant.effectiveStageName" -}}
{{- $local := .Values.stage | default dict -}}
{{- $gst := (.Values.global | default dict).stage | default dict -}}
{{- if $local.name -}}
{{- $local.name | toString -}}
{{- else if $gst.name -}}
{{- $gst.name | toString -}}
{{- end -}}
{{- end }}

{{/*
Environment label value.
*/}}
{{- define "qdrant.environmentLabel" -}}
{{- $sn := include "qdrant.effectiveStageName" . -}}
{{- if $sn -}}
{{- $sn -}}
{{- else -}}
{{- $g := (.Values.global | default dict).labels | default dict -}}
{{- $l := .Values.labels | default dict -}}
{{- default "" (default $l.environment $g.environment) -}}
{{- end -}}
{{- end }}

{{/*
Stage suffix appended to wrapper resource names (e.g. "-dev").
*/}}
{{- define "qdrant.stageSuffix" -}}
{{- $sn := include "qdrant.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Base name for wrapper-level resources: {Release.Name}-qdrant.
*/}}
{{- define "qdrant.fullnameBase" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-qdrant" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Fully qualified wrapper resource name: {Release.Name}-qdrant[-{stage}].
*/}}
{{- define "qdrant.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- include "qdrant.fullnameBase" . -}}
{{- else }}
{{- $base := include "qdrant.fullnameBase" . -}}
{{- $suffix := include "qdrant.stageSuffix" . -}}
{{- printf "%s%s" $base $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Common labels for wrapper-level resources.
*/}}
{{- define "qdrant.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/name: qdrant
app.kubernetes.io/instance: {{ include "qdrant.fullname" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
