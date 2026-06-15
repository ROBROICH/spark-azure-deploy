{{/*
DNS-safe chart name (lowercase, dots → hyphens).
*/}}
{{- define "spicedb.chartName" -}}
{{- $n := default .Chart.Name .Values.nameOverride | toString -}}
{{- $n | lower | replace "." "-" | trunc 53 | trimSuffix "-" -}}
{{- end }}

{{/*
Expand the name of the chart (app.kubernetes.io/name label).
*/}}
{{- define "spicedb.name" -}}
{{- include "spicedb.chartName" . -}}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
*/}}
{{- define "spicedb.effectiveStageName" -}}
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
{{- define "spicedb.environmentLabel" -}}
{{- $sn := include "spicedb.effectiveStageName" . -}}
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
{{- define "spicedb.stageSuffix" -}}
{{- $sn := include "spicedb.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Base name: {Release.Name}-{chart.name}.
Always includes both parts so resource names are predictable regardless of release name.
*/}}
{{- define "spicedb.fullnameBase" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "spicedb.chartName" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Fully qualified release name: {Release.Name}-{chart.name}-{stage.name}.
When fullnameOverride is set the stage suffix is not appended.
*/}}
{{- define "spicedb.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- include "spicedb.fullnameBase" . -}}
{{- else }}
{{- $base := include "spicedb.fullnameBase" . -}}
{{- $suffix := include "spicedb.stageSuffix" . -}}
{{- printf "%s%s" $base $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Chart name and version used for the helm.sh/chart label.
*/}}
{{- define "spicedb.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to all resources owned by this chart.
*/}}
{{- define "spicedb.labels" -}}
helm.sh/chart: {{ include "spicedb.chart" . }}
app.kubernetes.io/name: {{ include "spicedb.name" . }}
app.kubernetes.io/instance: {{ include "spicedb.fullname" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels (kept for structural consistency with other charts in this repo).
*/}}
{{- define "spicedb.selectorLabels" -}}
app.kubernetes.io/name: {{ include "spicedb.name" . }}
app.kubernetes.io/instance: {{ include "spicedb.fullname" . }}
{{- end }}

{{/*
Workload namespace for wrapper-level resources: Values.namespaceOverride, else Release.Namespace.
Note: operator and cluster resources use their own dedicated namespace values
(operator.namespace and cluster.namespace) defined in values.yaml.
*/}}
{{- define "spicedb.namespace" -}}
{{- $ns := .Values.namespaceOverride | default "" | toString | trim -}}
{{- if $ns -}}
{{- $ns -}}
{{- else -}}
{{- .Release.Namespace | default "default" -}}
{{- end -}}
{{- end }}

{{/*
Static operator resource name.
Operators are cluster-wide singletons — their names must not include the release
name or stage suffix, as a single operator instance serves the whole cluster.
Defaults to "spicedb-operator"; override with operator.name in values.yaml.
*/}}
{{- define "spicedb.operatorName" -}}
{{- .Values.operator.name | default "spicedb-operator" -}}
{{- end }}
