{{/*
Workload namespace: Values.namespaceOverride when set, else Release.Namespace.
*/}}
{{- define "temporal.namespace" -}}
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
{{- define "temporal.effectiveStageName" -}}
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
{{- define "temporal.environmentLabel" -}}
{{- $sn := include "temporal.effectiveStageName" . -}}
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
{{- define "temporal.stageSuffix" -}}
{{- $sn := include "temporal.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Base name for wrapper-level resources: {Release.Name}-temporal.
*/}}
{{- define "temporal.fullnameBase" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-temporal" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Fully qualified wrapper resource name: {Release.Name}-temporal[-{stage}].
Used for wrapper-owned resources such as the search-attributes Job.
*/}}
{{- define "temporal.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- include "temporal.fullnameBase" . -}}
{{- else }}
{{- $base := include "temporal.fullnameBase" . -}}
{{- $suffix := include "temporal.stageSuffix" . -}}
{{- printf "%s%s" $base $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Common labels for wrapper-level resources.
Arbitrary extra labels can be added via .Values.labels (flat key-value map).
*/}}
{{- define "temporal.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/name: temporal
app.kubernetes.io/instance: {{ include "temporal.fullname" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- $g := (.Values.global | default dict).labels | default dict -}}
{{- $l := .Values.labels | default dict -}}
{{- range $k, $v := merge (deepCopy $l) $g }}
{{ $k }}: {{ $v | quote }}
{{- end }}
{{- end }}

{{/*
Name of the search-attributes post-install Job.
*/}}
{{- define "temporal.searchAttributesJobName" -}}
{{- printf "%s-search-attributes" (include "temporal.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end }}
