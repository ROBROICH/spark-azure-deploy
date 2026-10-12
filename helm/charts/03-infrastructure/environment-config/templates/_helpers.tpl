{{/*
DNS-safe chart name (lowercase, dots → hyphens).
*/}}
{{- define "environment-config.chartName" -}}
{{- $n := default .Chart.Name .Values.nameOverride | toString -}}
{{- $n | lower | replace "." "-" | trunc 53 | trimSuffix "-" -}}
{{- end }}

{{/*
Expand the name of the chart (app.kubernetes.io/name label).
*/}}
{{- define "environment-config.name" -}}
{{- include "environment-config.chartName" . -}}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
This is the environment name (e.g. test, my-env, pr-123); it drives the
environment label.
*/}}
{{- define "environment-config.effectiveStageName" -}}
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
{{- define "environment-config.environmentLabel" -}}
{{- $sn := include "environment-config.effectiveStageName" . -}}
{{- if $sn -}}
{{- $sn -}}
{{- else -}}
{{- $g := (.Values.global | default dict).labels | default dict -}}
{{- $l := .Values.labels | default dict -}}
{{- default "" (default $l.environment $g.environment) -}}
{{- end -}}
{{- end }}

{{/*
Base name: {Release.Name}-{chart.name}.
Always includes both parts so resource names are predictable regardless of release name.
*/}}
{{- define "environment-config.fullnameBase" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "environment-config.chartName" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Fully qualified resource name. Most resources in this chart use fixed,
consumer-facing names (otel-collector, the shared ServiceAccount, the
ExternalSecret target names); this helper exists for label consistency with
the sibling charts.
*/}}
{{- define "environment-config.fullname" -}}
{{- include "environment-config.fullnameBase" . -}}
{{- end }}

{{/*
Chart name and version used for the helm.sh/chart label.
*/}}
{{- define "environment-config.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to all resources.
*/}}
{{- define "environment-config.labels" -}}
helm.sh/chart: {{ include "environment-config.chart" . }}
{{ include "environment-config.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- $environment := include "environment-config.environmentLabel" . -}}
{{- if $environment }}
environment: {{ $environment | quote }}
{{- end }}
{{- end }}

{{/*
Selector labels (structural consistency with the sibling charts).
*/}}
{{- define "environment-config.selectorLabels" -}}
app.kubernetes.io/name: {{ include "environment-config.name" . }}
app.kubernetes.io/instance: {{ include "environment-config.fullname" . }}
{{- end }}

{{/*
Workload namespace: Values.namespaceOverride when set, else Release.Namespace.
*/}}
{{- define "environment-config.namespace" -}}
{{- $ns := .Values.namespaceOverride | default "" | toString | trim -}}
{{- if $ns -}}
{{- $ns -}}
{{- else -}}
{{- .Release.Namespace | default "default" -}}
{{- end -}}
{{- end }}

{{/*
Name of the shared per-namespace ServiceAccount.
Precedence: serviceAccount.name > global.serviceAccount.name (the key every
leaf chart reads, so one global keeps every pod on the same
Workload-Identity-bound KSA) > "spark-workflow".
*/}}
{{- define "environment-config.serviceAccountName" -}}
{{- $gsa := ((.Values.global | default dict).serviceAccount) | default dict -}}
{{- .Values.serviceAccount.name | default $gsa.name | default "spark-workflow" -}}
{{- end }}
