{{/*
DNS-safe chart name (lowercase, dots → hyphens).
*/}}
{{- define "modul-suche-und-zuordnung.chartName" -}}
{{- $n := default .Chart.Name .Values.nameOverride | toString -}}
{{- $n | lower | replace "." "-" | trunc 53 | trimSuffix "-" -}}
{{- end }}

{{/*
Expand the name of the chart (app.kubernetes.io/name label).
*/}}
{{- define "modul-suche-und-zuordnung.name" -}}
{{- include "modul-suche-und-zuordnung.chartName" . -}}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
*/}}
{{- define "modul-suche-und-zuordnung.effectiveStageName" -}}
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
{{- define "modul-suche-und-zuordnung.environmentLabel" -}}
{{- $sn := include "modul-suche-und-zuordnung.effectiveStageName" . -}}
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
{{- define "modul-suche-und-zuordnung.stageSuffix" -}}
{{- $sn := include "modul-suche-und-zuordnung.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Base name: {Release.Name}-{chart.name}.
Always includes both parts so resource names are predictable regardless of release name.
*/}}
{{- define "modul-suche-und-zuordnung.fullnameBase" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "modul-suche-und-zuordnung.chartName" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Fully qualified resource name: {Release.Name}-{chart.name}-{stage.name}.
When fullnameOverride is set the stage suffix is not appended.
*/}}
{{- define "modul-suche-und-zuordnung.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- include "modul-suche-und-zuordnung.fullnameBase" . -}}
{{- else }}
{{- $base := include "modul-suche-und-zuordnung.fullnameBase" . -}}
{{- $suffix := include "modul-suche-und-zuordnung.stageSuffix" . -}}
{{- printf "%s%s" $base $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Chart name and version used for the helm.sh/chart label.
*/}}
{{- define "modul-suche-und-zuordnung.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to all resources and pod templates.
*/}}
{{- define "modul-suche-und-zuordnung.labels" -}}
helm.sh/chart: {{ include "modul-suche-und-zuordnung.chart" . }}
app.kubernetes.io/name: {{ include "modul-suche-und-zuordnung.name" . }}
app.kubernetes.io/instance: {{ include "modul-suche-und-zuordnung.fullname" . }}
{{- if .Values.selectorLabelsOverride }}
{{- include "modul-suche-und-zuordnung.checkSelectorOverride" . }}
{{- range $k, $v := .Values.selectorLabelsOverride }}
{{ $k }}: {{ $v | toString | quote }}
{{- end }}
{{- else if (.Values.global | default dict).legacyAppSelector }}
app: {{ include "modul-suche-und-zuordnung.fullname" . }}
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
{{- $environment := include "modul-suche-und-zuordnung.environmentLabel" . -}}
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
{{- define "modul-suche-und-zuordnung.selectorLabels" -}}
{{- if .Values.selectorLabelsOverride -}}
{{- include "modul-suche-und-zuordnung.checkSelectorOverride" . -}}
{{- $out := dict -}}
{{- range $k, $v := .Values.selectorLabelsOverride -}}
{{- $_ := set $out $k (toString $v) -}}
{{- end -}}
{{- toYaml $out -}}
{{- else if (.Values.global | default dict).legacyAppSelector -}}
app: {{ include "modul-suche-und-zuordnung.fullname" . }}
{{- else -}}
app.kubernetes.io/name: {{ include "modul-suche-und-zuordnung.name" . }}
app.kubernetes.io/instance: {{ include "modul-suche-und-zuordnung.fullname" . }}
{{- end -}}
{{- end }}

{{/*
selectorLabelsOverride may not use keys the chart sets itself: the pod would
carry the chart's value and no longer match its own selector.
*/}}
{{- define "modul-suche-und-zuordnung.checkSelectorOverride" -}}
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
names, the last segment of image.repository, e.g. "modul-suche-und-zuordnung"; typically
the images the branch's pipeline built). Otherwise image.tag, else Chart.appVersion.
*/}}
{{- define "modul-suche-und-zuordnung.imageTag" -}}
{{- $g := .Values.global | default dict -}}
{{- $follow := ne (toString .Values.image.followGlobalTag) "false" -}}
{{- $listed := or (ne (toString $g.imageTagRestrict) "true") (has (base (.Values.image.repository | toString)) (splitList "," ($g.imageTagServices | default "" | toString))) -}}
{{- $globalTag := ternary ($g.imageTag | default "") "" (and $follow $listed) -}}
{{- $globalTag | default .Values.image.tag | default .Chart.AppVersion -}}
{{- end }}

{{/*
Container name: containerName, else the chart (alias) name.
*/}}
{{- define "modul-suche-und-zuordnung.containerName" -}}
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
{{- define "modul-suche-und-zuordnung.serviceAccountCreate" -}}
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
{{- define "modul-suche-und-zuordnung.serviceAccountName" -}}
{{- $gsa := ((.Values.global | default dict).serviceAccount) | default dict -}}
{{- if .Values.serviceAccount.name -}}
{{- .Values.serviceAccount.name -}}
{{- else if $gsa.name -}}
{{- $gsa.name -}}
{{- else if include "modul-suche-und-zuordnung.serviceAccountCreate" . -}}
{{- include "modul-suche-und-zuordnung.fullname" . -}}
{{- else -}}
default
{{- end -}}
{{- end }}

{{/*
Annotations for the chart-created ServiceAccount: chart-local
serviceAccount.annotations merged over global.serviceAccount.annotations
(chart-local keys win). Empty output when neither is set.
*/}}
{{- define "modul-suche-und-zuordnung.serviceAccountAnnotations" -}}
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
{{- define "modul-suche-und-zuordnung.imagePullSecrets" -}}
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
{{- define "modul-suche-und-zuordnung.namespace" -}}
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
{{- define "modul-suche-und-zuordnung.containerEnv" -}}
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
{{- define "modul-suche-und-zuordnung.servicePort" -}}
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
{{- define "modul-suche-und-zuordnung.image" -}}
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
{{- $tag := include "modul-suche-und-zuordnung.imageTag" . -}}
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
{{- define "modul-suche-und-zuordnung.restricted" -}}
{{- $local := (.Values.podSecurity | default dict).restricted -}}
{{- $global := ((.Values.global | default dict).podSecurity | default dict).restricted -}}
{{- $on := true -}}
{{- if not (kindIs "invalid" $local) -}}{{- $on = $local -}}{{- else if not (kindIs "invalid" $global) -}}{{- $on = $global -}}{{- end -}}
{{- if $on -}}true{{- end -}}
{{- end }}

{{- define "modul-suche-und-zuordnung.podSecurityContext" -}}
{{- $d := dict -}}
{{- if include "modul-suche-und-zuordnung.restricted" . -}}
{{- $d = dict "runAsNonRoot" true "runAsUser" 65532 "runAsGroup" 65532 "seccompProfile" (dict "type" "RuntimeDefault") -}}
{{- end -}}
{{- with mergeOverwrite $d (deepCopy (.Values.podSecurityContext | default dict)) -}}
{{- toYaml . -}}
{{- end -}}
{{- end }}

{{- define "modul-suche-und-zuordnung.containerSecurityContext" -}}
{{- $d := dict -}}
{{- if include "modul-suche-und-zuordnung.restricted" . -}}
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
{{- define "modul-suche-und-zuordnung.tmpVolume" -}}
{{- $sc := include "modul-suche-und-zuordnung.containerSecurityContext" . | fromYaml -}}
{{- $mounted := false -}}
{{- range concat (.Values.volumeMounts | default list) (.Values.extraVolumeMounts | default list) -}}
{{- if eq (.mountPath | toString | trimSuffix "/") "/tmp" -}}{{- $mounted = true -}}{{- end -}}
{{- end -}}
{{- if and (include "modul-suche-und-zuordnung.restricted" .) $sc.readOnlyRootFilesystem (not $mounted) -}}true{{- end -}}
{{- end }}

{{/*
Whether pods mount a ServiceAccount token: serviceAccount.automount, else
global.serviceAccount.automount, else false — workloads that do not call the
Kubernetes API get no credential for it (GKE Workload Identity does not need
the token).
*/}}
{{- define "modul-suche-und-zuordnung.automountToken" -}}
{{- $local := .Values.serviceAccount.automount -}}
{{- $global := (((.Values.global | default dict).serviceAccount) | default dict).automount -}}
{{- if not (kindIs "invalid" $local) -}}{{- $local -}}{{- else if not (kindIs "invalid" $global) -}}{{- $global -}}{{- else -}}false{{- end -}}
{{- end }}
