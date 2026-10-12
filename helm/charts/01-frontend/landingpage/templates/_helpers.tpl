{{/*
DNS-safe chart name (lowercase, dots → hyphens).
*/}}
{{- define "landingpage.chartName" -}}
{{- $n := default .Chart.Name .Values.nameOverride | toString -}}
{{- $n | lower | replace "." "-" | trunc 53 | trimSuffix "-" -}}
{{- end }}

{{/*
Expand the name of the chart (app.kubernetes.io/name label).
*/}}
{{- define "landingpage.name" -}}
{{- include "landingpage.chartName" . -}}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
*/}}
{{- define "landingpage.effectiveStageName" -}}
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
{{- define "landingpage.environmentLabel" -}}
{{- $sn := include "landingpage.effectiveStageName" . -}}
{{- if $sn -}}
{{- $sn -}}
{{- else -}}
{{- $g := (.Values.global | default dict).labels | default dict -}}
{{- $l := .Values.labels | default dict -}}
{{- default "" (default $l.environment $g.environment) -}}
{{- end -}}
{{- end }}

{{/*
Stage suffix appended to resource names (e.g. "-my-env"). Empty when no stage is set.
*/}}
{{- define "landingpage.stageSuffix" -}}
{{- $sn := include "landingpage.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Base name: {Release.Name}-{chart.name}.
Always includes both parts so resource names are predictable regardless of release name.
*/}}
{{- define "landingpage.fullnameBase" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "landingpage.chartName" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Fully qualified resource name: {Release.Name}-{chart.name}-{stage.name}.
When fullnameOverride is set the stage suffix is not appended.
*/}}
{{- define "landingpage.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- include "landingpage.fullnameBase" . -}}
{{- else }}
{{- $base := include "landingpage.fullnameBase" . -}}
{{- $suffix := include "landingpage.stageSuffix" . -}}
{{- printf "%s%s" $base $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Chart name and version used for the helm.sh/chart label.
*/}}
{{- define "landingpage.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to all resources and pod templates.
*/}}
{{- define "landingpage.labels" -}}
helm.sh/chart: {{ include "landingpage.chart" . }}
{{ include "landingpage.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- $l := .Values.labels | default dict -}}
{{- if $l.type }}
app.kubernetes.io/component: {{ $l.type | quote }}
type: {{ $l.type | quote }}
{{- end }}
{{- $environment := include "landingpage.environmentLabel" . -}}
{{- if $environment }}
environment: {{ $environment | quote }}
{{- end }}
{{- end }}

{{/*
Selector labels used by Service.spec.selector and Deployment.spec.selector.matchLabels.
instance equals fullname so each chart in a multi-chart release has a unique selector.
*/}}
{{- define "landingpage.selectorLabels" -}}
app.kubernetes.io/name: {{ include "landingpage.name" . }}
app.kubernetes.io/instance: {{ include "landingpage.fullname" . }}
{{- end }}

{{/*
ServiceAccount handling.

Shared-SA mode: when global.serviceAccount.name is set, this chart renders NO
ServiceAccount at all (the shared SA is created elsewhere, e.g. by the
environment chart) and all pods use the global name. A chart-local
serviceAccount.name still takes precedence for the pod's serviceAccountName.
global.serviceAccount.create=false suppresses ServiceAccount creation without
forcing a shared name (pods then fall back to chart-local name /
global name / "default"). global.serviceAccount.annotations are merged under
chart-local serviceAccount.annotations when this chart creates its own
ServiceAccount.
*/}}

{{/*
Effective "create": non-empty ("true") when this chart creates its own
ServiceAccount — chart-local serviceAccount.create is true AND
global.serviceAccount.name is not set AND global.serviceAccount.create is not
explicitly false.
*/}}
{{- define "landingpage.serviceAccountCreate" -}}
{{- $gsa := ((.Values.global | default dict).serviceAccount) | default dict -}}
{{- $globalOff := and (hasKey $gsa "create") (not $gsa.create) -}}
{{- if and .Values.serviceAccount.create (not $gsa.name) (not $globalOff) -}}
true
{{- end -}}
{{- end }}

{{/*
Name of the ServiceAccount to use.
Precedence: chart-local serviceAccount.name > global.serviceAccount.name >
generated fullname (when this chart creates its own SA) > "default".
*/}}
{{- define "landingpage.serviceAccountName" -}}
{{- $gsa := ((.Values.global | default dict).serviceAccount) | default dict -}}
{{- if .Values.serviceAccount.name -}}
{{- .Values.serviceAccount.name -}}
{{- else if $gsa.name -}}
{{- $gsa.name -}}
{{- else if include "landingpage.serviceAccountCreate" . -}}
{{- include "landingpage.fullname" . -}}
{{- else -}}
default
{{- end -}}
{{- end }}

{{/*
Annotations for the chart-created ServiceAccount: chart-local
serviceAccount.annotations merged over global.serviceAccount.annotations
(chart-local keys win). Empty output when neither is set.
*/}}
{{- define "landingpage.serviceAccountAnnotations" -}}
{{- $gsa := ((.Values.global | default dict).serviceAccount) | default dict -}}
{{- $merged := merge (deepCopy (.Values.serviceAccount.annotations | default dict)) ($gsa.annotations | default dict) -}}
{{- if $merged -}}
{{- toYaml $merged -}}
{{- end -}}
{{- end }}

{{/*
Pod imagePullSecrets: global.imagePullSecrets followed by the chart-local
imagePullSecrets, de-duplicated by name. A pod-level list REPLACES the
ServiceAccount's imagePullSecrets (no merge by Kubernetes), so every
credential the environment needs must be on the pod — global.imagePullSecrets
carries the environment-wide ones (e.g. the secret for the registry all of
the environment's images come from). Empty output when neither is set.
*/}}
{{- define "landingpage.imagePullSecrets" -}}
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
Workload namespace.
Precedence: chart-local Values.namespaceOverride > global.namespaceOverride >
Release.Namespace. Layer umbrellas set their default namespace via
global.namespaceOverride, so a parent umbrella's global.namespaceOverride
(helm parent globals win) collapses all subcharts into one namespace, while a
chart-local override still wins.
*/}}
{{- define "landingpage.namespace" -}}
{{- $ns := .Values.namespaceOverride | default "" | toString | trim -}}
{{- $gns := ((.Values.global | default dict).namespaceOverride) | default "" | toString | trim -}}
{{- if $ns -}}
{{- $ns -}}
{{- else if $gns -}}
{{- $gns -}}
{{- else -}}
{{- .Release.Namespace | default "default" -}}
{{- end -}}
{{- end }}

{{/*
Merged container env (lowest → highest precedence): global.env, env, global.extraEnv, extraEnv.
Values containing "{{" are expanded via tpl at render time.
*/}}
{{- define "landingpage.containerEnv" -}}
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
{{- $sortedEnv := list }}
{{- range $k := keys $envMap | sortAlpha }}
{{- $sortedEnv = append $sortedEnv (get $envMap $k) }}
{{- end }}
{{- if $sortedEnv }}{{ toYaml $sortedEnv }}{{ end }}
{{- end }}

{{/*
Image reference: [registry/]repository:tag[@digest]. registry: image.registry,
else global.imageRegistry when image.repository names no registry itself
(its first segment has no ".", ":" or "<").
*/}}
{{- define "landingpage.image" -}}
{{- $img := .Values.image -}}
{{- $g := .Values.global | default dict -}}
{{- $repo := $img.repository | toString -}}
{{- $first := first (splitList "/" $repo) -}}
{{- $hasHost := and (contains "/" $repo) (or (contains "." $first) (contains ":" $first) (hasPrefix "<" $first) (eq $first "localhost")) -}}
{{- $registry := $img.registry | default "" -}}
{{- if and (not $registry) (not $hasHost) -}}
{{- $registry = $g.imageRegistry | default "" -}}
{{- end -}}
{{- $ref := ternary (printf "%s/%s" (trimSuffix "/" $registry) $repo) $repo (ne $registry "") -}}
{{- $tag := (.Values.image.tag | default .Chart.AppVersion | toString) -}}
{{- if and $img.digest (eq $tag (.Values.image.tag | default .Chart.AppVersion | toString)) -}}
{{- printf "%s:%s@%s" $ref $tag $img.digest -}}
{{- else -}}
{{- printf "%s:%s" $ref $tag -}}
{{- end -}}
{{- end }}
