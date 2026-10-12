{{/*
Wrapper-resource namespace. Precedence: Values.namespaceOverride, then
global.namespaceOverride (umbrella namespace collapse), then
Release.Namespace. The upstream subchart always uses the release namespace.
*/}}
{{- define "temporal-wrapper.namespace" -}}
{{- $ns := .Values.namespaceOverride | default "" | toString | trim -}}
{{- $gns := ((.Values.global | default dict).namespaceOverride | default "" | toString | trim) -}}
{{- if $ns -}}
{{- $ns -}}
{{- else if $gns -}}
{{- $gns -}}
{{- else -}}
{{- .Release.Namespace | default "default" -}}
{{- end -}}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
*/}}
{{- define "temporal-wrapper.effectiveStageName" -}}
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
{{- define "temporal-wrapper.environmentLabel" -}}
{{- $sn := include "temporal-wrapper.effectiveStageName" . -}}
{{- if $sn -}}
{{- $sn -}}
{{- else -}}
{{- $g := (.Values.global | default dict).labels | default dict -}}
{{- $l := .Values.labels | default dict -}}
{{- default "" (default $l.environment $g.environment) -}}
{{- end -}}
{{- end }}

{{/*
Stage suffix appended to wrapper resource names (e.g. "-my-env").
*/}}
{{- define "temporal-wrapper.stageSuffix" -}}
{{- $sn := include "temporal-wrapper.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Base name for wrapper-level resources: {Release.Name}-temporal.
*/}}
{{- define "temporal-wrapper.fullnameBase" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-temporal" .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Fully qualified wrapper resource name: {Release.Name}-temporal[-{stage}].
Used for wrapper-owned resources such as the search-attributes Job. The
upstream subchart's own resources are named {Release.Name}-temporal-<component>
without a stage suffix.
*/}}
{{- define "temporal-wrapper.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- include "temporal-wrapper.fullnameBase" . -}}
{{- else }}
{{- $base := include "temporal-wrapper.fullnameBase" . -}}
{{- $suffix := include "temporal-wrapper.stageSuffix" . -}}
{{- printf "%s%s" $base $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Common labels for wrapper-level resources.
Arbitrary extra labels can be added via .Values.labels (flat key-value map);
global.labels entries from the umbrella are merged in.
*/}}
{{- define "temporal-wrapper.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/name: temporal
app.kubernetes.io/instance: {{ include "temporal-wrapper.fullname" . }}
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
{{- define "temporal-wrapper.searchAttributesJobName" -}}
{{- printf "%s-search-attributes" (include "temporal-wrapper.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{/*
ServiceAccount for the search-attributes Job pod. Precedence:
searchAttributesJob.serviceAccountName, then global.serviceAccount.name
(shared per-namespace KSA). Empty result → no serviceAccountName
is rendered and the pod runs under the namespace default SA.
*/}}
{{- define "temporal-wrapper.searchAttributesJobServiceAccountName" -}}
{{- $gsa := ((.Values.global | default dict).serviceAccount | default dict) -}}
{{- if .Values.searchAttributesJob.serviceAccountName -}}
{{- .Values.searchAttributesJob.serviceAccountName -}}
{{- else if $gsa.name -}}
{{- $gsa.name -}}
{{- end -}}
{{- end }}

{{/*
Fullname of the upstream subchart (its temporal.fullname helper):
temporal.fullnameOverride, else the release name when it contains the chart
name (temporal.nameOverride, default "temporal"), else <release>-<name>.
*/}}
{{- define "temporal-wrapper.upstreamFullname" -}}
{{- $sub := .Values.temporal | default dict -}}
{{- if $sub.fullnameOverride -}}
{{- $sub.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := $sub.nameOverride | default "temporal" -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end }}
