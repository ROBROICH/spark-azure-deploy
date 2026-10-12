{{/*
DNS-safe chart name (lowercase, dots → hyphens).
*/}}
{{- define "jura-db-service.chartName" -}}
{{- $n := default .Chart.Name .Values.nameOverride | toString -}}
{{- $n | lower | replace "." "-" | trunc 53 | trimSuffix "-" -}}
{{- end }}

{{/*
Expand the name of the chart (app.kubernetes.io/name label).
*/}}
{{- define "jura-db-service.name" -}}
{{- include "jura-db-service.chartName" . -}}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
*/}}
{{- define "jura-db-service.effectiveStageName" -}}
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
{{- define "jura-db-service.environmentLabel" -}}
{{- $sn := include "jura-db-service.effectiveStageName" . -}}
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
{{- define "jura-db-service.stageSuffix" -}}
{{- $sn := include "jura-db-service.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Base name: {Release.Name}-{chart.name}.
Always includes both parts so resource names are predictable regardless of release name.
*/}}
{{- define "jura-db-service.fullnameBase" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "jura-db-service.chartName" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Fully qualified resource name: {Release.Name}-{chart.name}-{stage.name}.
When fullnameOverride is set the stage suffix is not appended.
*/}}
{{- define "jura-db-service.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- include "jura-db-service.fullnameBase" . -}}
{{- else }}
{{- $base := include "jura-db-service.fullnameBase" . -}}
{{- $suffix := include "jura-db-service.stageSuffix" . -}}
{{- printf "%s%s" $base $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Chart name and version used for the helm.sh/chart label.
*/}}
{{- define "jura-db-service.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to all resources and pod templates.
*/}}
{{- define "jura-db-service.labels" -}}
helm.sh/chart: {{ include "jura-db-service.chart" . }}
app.kubernetes.io/name: {{ include "jura-db-service.name" . }}
app.kubernetes.io/instance: {{ include "jura-db-service.fullname" . }}
{{- if .Values.selectorLabelsOverride }}
{{- include "jura-db-service.checkSelectorOverride" . }}
{{- range $k, $v := .Values.selectorLabelsOverride }}
{{ $k }}: {{ $v | toString | quote }}
{{- end }}
{{- else if (.Values.global | default dict).legacyAppSelector }}
app: {{ include "jura-db-service.fullname" . }}
{{- end }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- $l := .Values.labels | default dict -}}
{{- if $l.type }}
app.kubernetes.io/component: {{ $l.type | quote }}
type: {{ $l.type | quote }}
{{- end }}
{{- $environment := include "jura-db-service.environmentLabel" . -}}
{{- if $environment }}
environment: {{ $environment | quote }}
{{- end }}
{{- end }}

{{/*
Selector labels used by Service.spec.selector and Deployment.spec.selector.matchLabels.
instance equals fullname so each chart in a multi-chart release has a unique selector.
global.legacyAppSelector switches to the legacy selector app: <fullname>,
which migration from a Kustomize-based deployment requires when adopting its
Deployments (a Deployment's selector is immutable). selectorLabelsOverride replaces the
selector verbatim for Deployments whose existing selector follows neither
scheme; its labels are added to every resource of the chart.
*/}}
{{- define "jura-db-service.selectorLabels" -}}
{{- if .Values.selectorLabelsOverride -}}
{{- include "jura-db-service.checkSelectorOverride" . -}}
{{- $out := dict -}}
{{- range $k, $v := .Values.selectorLabelsOverride -}}
{{- $_ := set $out $k (toString $v) -}}
{{- end -}}
{{- toYaml $out -}}
{{- else if (.Values.global | default dict).legacyAppSelector -}}
app: {{ include "jura-db-service.fullname" . }}
{{- else -}}
app.kubernetes.io/name: {{ include "jura-db-service.name" . }}
app.kubernetes.io/instance: {{ include "jura-db-service.fullname" . }}
{{- end -}}
{{- end }}

{{/*
selectorLabelsOverride may not use keys the chart sets itself: the pod would
carry the chart's value and no longer match its own selector.
*/}}
{{- define "jura-db-service.checkSelectorOverride" -}}
{{- range $k := list "app.kubernetes.io/name" "app.kubernetes.io/instance" "app.kubernetes.io/version" "app.kubernetes.io/managed-by" "app.kubernetes.io/component" "helm.sh/chart" "type" "environment" }}
{{- if hasKey $.Values.selectorLabelsOverride $k }}
{{- fail (printf "%s: selectorLabelsOverride must not set %q (a label the chart sets itself)" $.Chart.Name $k) }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Image tag. global.imageTag (e.g. a branch environment's moving tag) wins
unless image.followGlobalTag is false, or global.imageTagRestrict is true and
the image is not listed in global.imageTagServices (comma-separated image
names, the last segment of image.repository, e.g. "jura-db-service"; typically
the images the branch's pipeline built). Otherwise image.tag, else Chart.appVersion.
*/}}
{{- define "jura-db-service.imageTag" -}}
{{- $g := .Values.global | default dict -}}
{{- $follow := ne (toString .Values.image.followGlobalTag) "false" -}}
{{- $listed := or (ne (toString $g.imageTagRestrict) "true") (has (base (.Values.image.repository | toString)) (splitList "," ($g.imageTagServices | default "" | toString))) -}}
{{- $globalTag := ternary ($g.imageTag | default "") "" (and $follow $listed) -}}
{{- $globalTag | default .Values.image.tag | default .Chart.AppVersion -}}
{{- end }}

{{/*
Container name: containerName, else the chart (alias) name.
*/}}
{{- define "jura-db-service.containerName" -}}
{{- .Values.containerName | default .Chart.Name -}}
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
{{- define "jura-db-service.serviceAccountCreate" -}}
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
{{- define "jura-db-service.serviceAccountName" -}}
{{- $gsa := ((.Values.global | default dict).serviceAccount) | default dict -}}
{{- if .Values.serviceAccount.name -}}
{{- .Values.serviceAccount.name -}}
{{- else if $gsa.name -}}
{{- $gsa.name -}}
{{- else if include "jura-db-service.serviceAccountCreate" . -}}
{{- include "jura-db-service.fullname" . -}}
{{- else -}}
default
{{- end -}}
{{- end }}

{{/*
Annotations for the chart-created ServiceAccount: chart-local
serviceAccount.annotations merged over global.serviceAccount.annotations
(chart-local keys win). Empty output when neither is set.
*/}}
{{- define "jura-db-service.serviceAccountAnnotations" -}}
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
{{- define "jura-db-service.imagePullSecrets" -}}
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
{{- define "jura-db-service.namespace" -}}
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
Merged container env (lowest → highest precedence): global.env, global.extraEnv, env, extraEnv.
Values containing "{{" are expanded via tpl at render time; other scalars
(numbers, booleans) are rendered as strings, as the EnvVar API requires.
Entries are emitted sorted by name so renders are deterministic (Go map
iteration order is random; unsorted emission reshuffles env on every render).
*/}}
{{- define "jura-db-service.containerEnv" -}}
{{- $g := .Values.global | default dict -}}
{{- $envMap := dict }}
{{- range concat ($g.env | default list) ($g.extraEnv | default list) (.Values.env | default list) (.Values.extraEnv | default list) }}
{{- $out := dict "name" .name }}
{{- if .valueFrom }}
{{- $_ := set $out "valueFrom" .valueFrom }}
{{- else if and (kindIs "string" .value) (contains "{{" (.value | toString)) }}
{{- $_ := set $out "value" (tpl (.value | toString) $ | trim) }}
{{- else if not (kindIs "invalid" .value) }}
{{- $_ := set $out "value" (.value | toString) }}
{{- end }}
{{- $_ := set $envMap .name $out }}
{{- end }}
{{- if $envMap }}
{{- $sortedEnv := list }}
{{- range $k := keys $envMap | sortAlpha }}
{{- $sortedEnv = append $sortedEnv (get $envMap $k) }}
{{- end }}
{{- toYaml $sortedEnv }}
{{- end }}
{{- end }}

{{/*
Port the chart's Service exposes, for consumers such as the Ingress: the
first entry of service.ports, else the deprecated service.port.
*/}}
{{- define "jura-db-service.servicePort" -}}
{{- with .Values.service.ports -}}
{{- (first .).port -}}
{{- else -}}
{{- .Values.service.port -}}
{{- end -}}
{{- end }}

{{/*
Image reference: [registry/]repository:tag[@digest].
registry: image.registry, else global.imageRegistry — the global registry is
only prefixed when image.repository names none itself (its first segment has
no ".", ":" or "<"), so a full repository path keeps working unchanged.
digest: image.digest is appended to the chart's own tag, never to a moving
global.imageTag (branch environments).
*/}}
{{- define "jura-db-service.image" -}}
{{- $g := .Values.global | default dict -}}
{{- $repo := .Values.image.repository | toString -}}
{{- $first := first (splitList "/" $repo) -}}
{{- $hasHost := and (contains "/" $repo) (or (contains "." $first) (contains ":" $first) (hasPrefix "<" $first) (eq $first "localhost")) -}}
{{- $registry := .Values.image.registry | default "" -}}
{{- if and (not $registry) (not $hasHost) -}}
{{- $registry = $g.imageRegistry | default "" -}}
{{- end -}}
{{- $ref := $repo -}}
{{- if $registry -}}
{{- $ref = printf "%s/%s" (trimSuffix "/" $registry) $repo -}}
{{- end -}}
{{- $tag := include "jura-db-service.imageTag" . -}}
{{- $own := .Values.image.tag | default .Chart.AppVersion | toString -}}
{{- if and .Values.image.digest (eq $tag $own) -}}
{{- printf "%s:%s@%s" $ref $tag .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" $ref $tag -}}
{{- end -}}
{{- end }}

{{/*
Pod security. podSecurity.restricted (chart value, else
global.podSecurity.restricted, else true) applies the Kubernetes "restricted"
Pod Security Standard by default: non-root (uid/gid 65532), RuntimeDefault
seccomp, no privilege escalation, all capabilities dropped and a read-only
root filesystem with an emptyDir on /tmp. podSecurityContext / securityContext
are merged over these defaults key by key (set a key to override it).
*/}}
{{- define "jura-db-service.restricted" -}}
{{- $local := (.Values.podSecurity | default dict).restricted -}}
{{- $global := ((.Values.global | default dict).podSecurity | default dict).restricted -}}
{{- $on := true -}}
{{- if not (kindIs "invalid" $local) -}}{{- $on = $local -}}{{- else if not (kindIs "invalid" $global) -}}{{- $on = $global -}}{{- end -}}
{{- if $on -}}true{{- end -}}
{{- end }}

{{- define "jura-db-service.podSecurityContext" -}}
{{- $d := dict -}}
{{- if include "jura-db-service.restricted" . -}}
{{- $d = dict "runAsNonRoot" true "runAsUser" 65532 "runAsGroup" 65532 "seccompProfile" (dict "type" "RuntimeDefault") -}}
{{- end -}}
{{- with mergeOverwrite $d (deepCopy (.Values.podSecurityContext | default dict)) -}}
{{- toYaml . -}}
{{- end -}}
{{- end }}

{{- define "jura-db-service.containerSecurityContext" -}}
{{- $d := dict -}}
{{- if include "jura-db-service.restricted" . -}}
{{- $d = dict "allowPrivilegeEscalation" false "capabilities" (dict "drop" (list "ALL")) "readOnlyRootFilesystem" true -}}
{{- end -}}
{{- with mergeOverwrite $d (deepCopy (.Values.securityContext | default dict)) -}}
{{- toYaml . -}}
{{- end -}}
{{- end }}

{{/*
"true" when the restricted defaults apply, the root filesystem is read-only
and nothing is mounted on /tmp yet: the chart then provides an emptyDir there.
*/}}
{{- define "jura-db-service.tmpVolume" -}}
{{- $sc := include "jura-db-service.containerSecurityContext" . | fromYaml -}}
{{- $mounted := false -}}
{{- range concat (.Values.volumeMounts | default list) (.Values.extraVolumeMounts | default list) -}}
{{- if eq (.mountPath | toString | trimSuffix "/") "/tmp" -}}{{- $mounted = true -}}{{- end -}}
{{- end -}}
{{- if and (include "jura-db-service.restricted" .) $sc.readOnlyRootFilesystem (not $mounted) -}}true{{- end -}}
{{- end }}

{{/*
Whether pods mount a ServiceAccount token: serviceAccount.automount, else
global.serviceAccount.automount, else false — workloads that do not call the
Kubernetes API get no credential for it (GKE Workload Identity does not need
the token).
*/}}
{{- define "jura-db-service.automountToken" -}}
{{- $local := .Values.serviceAccount.automount -}}
{{- $global := (((.Values.global | default dict).serviceAccount) | default dict).automount -}}
{{- if not (kindIs "invalid" $local) -}}{{- $local -}}{{- else if not (kindIs "invalid" $global) -}}{{- $global -}}{{- else -}}false{{- end -}}
{{- end }}
