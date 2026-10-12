{{/*
Stage suffix of the shared backend objects (same rule as the pools).
*/}}
{{- define "backend-services.stageSuffix" -}}
{{- $sn := (((.Values.global | default dict).stage | default dict).name | default "") | toString -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Namespace of the shared backend objects — the pools' namespace:
global.backend.namespaceOverride > global.namespaceOverride > Release.Namespace.
*/}}
{{- define "backend-services.namespace" -}}
{{- $g := .Values.global | default dict -}}
{{- coalesce (($g.backend | default dict).namespaceOverride | default "" | toString | trim) ($g.namespaceOverride | default "" | toString | trim) .Release.Namespace "default" -}}
{{- end }}

{{/*
Shared ConfigMap name — same rule as "spark-backend-pool.configMapName".
*/}}
{{- define "backend-services.configMapName" -}}
{{- $g := .Values.global | default dict -}}
{{- $name := ($g.backend | default dict).configMapName | default "" -}}
{{- if $name -}}
{{- $name -}}
{{- else -}}
{{- printf "%s-backend-config%s" .Release.Name (include "backend-services.stageSuffix" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
global.backend.config as ConfigMap data — same rule as
"spark-backend-pool.renderedConfig" (the pools hash it for rollouts).
*/}}
{{- define "backend-services.renderedConfig" -}}
{{- $config := (((.Values.global | default dict).backend | default dict).config | default dict) -}}
{{- $out := dict -}}
{{- range $key, $value := $config -}}
{{- $_ := set $out $key (ternary (tpl (toString $value) $) (toJson $value) (kindIs "string" $value)) -}}
{{- end -}}
{{- toJson $out -}}
{{- end }}

{{/*
Labels of the shared backend objects.
*/}}
{{- define "backend-services.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/component: backend
app.kubernetes.io/part-of: spark-backend
{{- $sn := (((.Values.global | default dict).stage | default dict).name | default "") | toString }}
{{- $environment := $sn | default (((.Values.global | default dict).labels | default dict).environment | default "") }}
{{- if $environment }}
environment: {{ $environment | quote }}
{{- end }}
{{- end }}
