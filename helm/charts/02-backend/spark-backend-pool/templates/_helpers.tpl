{{/*
DNS-safe pool name (lowercase, dots → hyphens): nameOverride, else the alias.
*/}}
{{- define "spark-backend-pool.name" -}}
{{- default .Chart.Name .Values.nameOverride | toString | lower | replace "." "-" | trunc 53 | trimSuffix "-" -}}
{{- end }}

{{/*
Effective stage name: chart-level Values.stage.name overrides global.stage.name.
*/}}
{{- define "spark-backend-pool.effectiveStageName" -}}
{{- $local := .Values.stage | default dict -}}
{{- $gst := (.Values.global | default dict).stage | default dict -}}
{{- if $local.name -}}
{{- $local.name | toString -}}
{{- else if $gst.name -}}
{{- $gst.name | toString -}}
{{- end -}}
{{- end }}

{{/*
Environment label value: stage name, else global.labels.environment.
*/}}
{{- define "spark-backend-pool.environmentLabel" -}}
{{- $sn := include "spark-backend-pool.effectiveStageName" . -}}
{{- if $sn -}}
{{- $sn -}}
{{- else -}}
{{- ((.Values.global | default dict).labels | default dict).environment | default "" -}}
{{- end -}}
{{- end }}

{{/*
Stage suffix appended to resource names (e.g. "-dev"). Empty when no stage is set.
*/}}
{{- define "spark-backend-pool.stageSuffix" -}}
{{- $sn := include "spark-backend-pool.effectiveStageName" . -}}
{{- if $sn -}}
{{- printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-") -}}
{{- end -}}
{{- end }}

{{/*
Fully qualified resource name: fullnameOverride verbatim, else
{Release.Name}-{pool}-{stage}.
*/}}
{{- define "spark-backend-pool.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s%s" .Release.Name (include "spark-backend-pool.name" .) (include "spark-backend-pool.stageSuffix" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
Name of the shared backend ConfigMap: global.backend.configMapName, else
{Release.Name}-backend-config-{stage}. The backend-services umbrella derives
the same name (keep both definitions in sync).
*/}}
{{- define "spark-backend-pool.configMapName" -}}
{{- $g := .Values.global | default dict -}}
{{- $name := ($g.backend | default dict).configMapName | default "" -}}
{{- if $name -}}
{{- $name -}}
{{- else -}}
{{- $sn := (($g.stage | default dict).name | default "") | toString -}}
{{- $suffix := ternary "" (printf "-%s" ($sn | lower | replace "." "-" | trunc 10 | trimSuffix "-")) (eq $sn "") -}}
{{- printf "%s-backend-config%s" .Release.Name $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{/*
global.backend.config rendered as the ConfigMap data: string values through
tpl (templates may reference .Release and .Values.global only — they are
rendered in the umbrella and, for the checksum, in every pool), other values
as JSON (no float formatting of numbers).
*/}}
{{- define "spark-backend-pool.renderedConfig" -}}
{{- $config := (((.Values.global | default dict).backend | default dict).config | default dict) -}}
{{- $out := dict -}}
{{- range $key, $value := $config -}}
{{- $_ := set $out $key (ternary (tpl (toString $value) $) (toJson $value) (kindIs "string" $value)) -}}
{{- end -}}
{{- toJson $out -}}
{{- end }}

{{/*
Chart name and version used for the helm.sh/chart label.
*/}}
{{- define "spark-backend-pool.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Selector labels. Standard: app.kubernetes.io/name + instance. With
global.legacyAppSelector: app: <fullname> (migration from a Kustomize-based deployment).
*/}}
{{- define "spark-backend-pool.selectorLabels" -}}
{{- if (.Values.global | default dict).legacyAppSelector -}}
app: {{ include "spark-backend-pool.fullname" . }}
{{- else -}}
app.kubernetes.io/name: {{ include "spark-backend-pool.name" . }}
app.kubernetes.io/instance: {{ include "spark-backend-pool.fullname" . }}
{{- end -}}
{{- end }}

{{/*
Common labels. app.kubernetes.io/part-of: spark-backend selects every pool
(metrics AuthorizationPolicy).
*/}}
{{- define "spark-backend-pool.labels" -}}
helm.sh/chart: {{ include "spark-backend-pool.chart" . }}
app.kubernetes.io/name: {{ include "spark-backend-pool.name" . }}
app.kubernetes.io/instance: {{ include "spark-backend-pool.fullname" . }}
{{- if (.Values.global | default dict).legacyAppSelector }}
app: {{ include "spark-backend-pool.fullname" . }}
{{- end }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/component: backend
app.kubernetes.io/part-of: spark-backend
type: backend
{{- $environment := include "spark-backend-pool.environmentLabel" . }}
{{- if $environment }}
environment: {{ $environment | quote }}
{{- end }}
{{- end }}

{{/*
Workload namespace. Precedence: namespaceOverride > global.backend.namespaceOverride
> global.namespaceOverride > Release.Namespace.
*/}}
{{- define "spark-backend-pool.namespace" -}}
{{- $g := .Values.global | default dict -}}
{{- $backend := $g.backend | default dict -}}
{{- coalesce (.Values.namespaceOverride | toString | trim) ($backend.namespaceOverride | default "" | toString | trim) ($g.namespaceOverride | default "" | toString | trim) .Release.Namespace "default" -}}
{{- end }}

{{/*
ServiceAccount: global.serviceAccount.name > global.backend.serviceAccountName
> "default". The pools never create a ServiceAccount.
*/}}
{{- define "spark-backend-pool.serviceAccountName" -}}
{{- $g := .Values.global | default dict -}}
{{- coalesce (($g.serviceAccount | default dict).name | default "") (($g.backend | default dict).serviceAccountName | default "") "default" -}}
{{- end }}

{{/*
Pod imagePullSecrets: global.imagePullSecrets followed by
global.backend.imagePullSecrets, de-duplicated by name (a pod-level list
replaces the ServiceAccount's). Empty output when neither is set.
*/}}
{{- define "spark-backend-pool.imagePullSecrets" -}}
{{- $g := .Values.global | default dict -}}
{{- $seen := dict -}}
{{- $out := list -}}
{{- range concat ($g.imagePullSecrets | default list) ((($g.backend | default dict).imagePullSecrets) | default list) -}}
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
Container env, lowest → highest precedence: API_POOL, ACTIVE_FEATURE_WORKER
and OTEL_RESOURCE_ATTRIBUTES (first, because OTEL_RESOURCE_ATTRIBUTES expands
$(API_POOL) and Kubernetes only resolves earlier entries), global.env,
global.extraEnv, global.backend.env, the pool's env. A later entry with the
same name replaces the earlier one in place, so the order stays deterministic.
Values containing "{{" are expanded via tpl.
*/}}
{{- define "spark-backend-pool.containerEnv" -}}
{{- $g := .Values.global | default dict -}}
{{- $backend := $g.backend | default dict -}}
{{- $fixed := list -}}
{{- if ne (toString .Values.pool.injectEnv) "false" -}}
{{- $fixed = list
  (dict "name" "API_POOL" "value" (.Values.pool.apiPool | default .Chart.Name))
  (dict "name" "ACTIVE_FEATURE_WORKER" "value" (.Values.pool.worker | default "none"))
  (dict "name" "OTEL_RESOURCE_ATTRIBUTES" "value" "api.pool=$(API_POOL)")
-}}
{{- end -}}
{{- $names := list -}}
{{- $byName := dict -}}
{{- range concat $fixed ($g.env | default list) ($g.extraEnv | default list) ($backend.env | default list) (.Values.env | default list) -}}
{{- $out := dict "name" .name -}}
{{- if .valueFrom -}}
{{- $_ := set $out "valueFrom" .valueFrom -}}
{{- else if and (kindIs "string" .value) (contains "{{" (.value | toString)) -}}
{{- $_ := set $out "value" (tpl (.value | toString) $ | trim) -}}
{{- else if kindIs "string" .value -}}
{{- $_ := set $out "value" .value -}}
{{- else if not (kindIs "invalid" .value) -}}
{{- $_ := set $out "value" (toJson .value) -}}
{{- end -}}
{{- if not (hasKey $byName .name) -}}
{{- $names = append $names .name -}}
{{- end -}}
{{- $_ := set $byName .name $out -}}
{{- end -}}
{{- $env := list -}}
{{- range $names -}}
{{- $env = append $env (get $byName .) -}}
{{- end -}}
{{- toYaml $env -}}
{{- end }}

{{/*
Image tag of the shared backend image. global.imageTag (a branch environment's
moving tag) wins unless global.imageTagRestrict is true and the image
(last segment of global.backend.image.repository, "spark-backend") is not
listed in global.imageTagServices; otherwise global.backend.image.tag. Same
rule as the standard leaf charts' <chart>.imageTag.
*/}}
{{/*
The pool's image: its own image map (any of registry, repository, tag,
digest, pullPolicy) merged over global.backend.image.
*/}}
{{- define "spark-backend-pool.effectiveImage" -}}
{{- $shared := ((.Values.global | default dict).backend | default dict).image | default dict -}}
{{- toYaml (mergeOverwrite (deepCopy $shared) (deepCopy (.Values.image | default dict))) -}}
{{- end }}

{{- define "spark-backend-pool.imageTag" -}}
{{- $g := .Values.global | default dict -}}
{{- $image := include "spark-backend-pool.effectiveImage" . | fromYaml -}}
{{- $listed := or (ne (toString $g.imageTagRestrict) "true") (has (base ($image.repository | default "" | toString)) (splitList "," ($g.imageTagServices | default "" | toString))) -}}
{{- $globalTag := ternary ($g.imageTag | default "") "" $listed -}}
{{- $globalTag | default $image.tag -}}
{{- end }}

{{/*
Image reference: [registry/]repository:tag[@digest]. registry: image.registry,
else global.imageRegistry when image.repository names no registry itself
(its first segment has no ".", ":" or "<").
*/}}
{{- define "spark-backend-pool.image" -}}
{{- $img := include "spark-backend-pool.effectiveImage" . | fromYaml -}}
{{- $_ := required "global.backend.image.repository is required" $img.repository -}}
{{- $g := .Values.global | default dict -}}
{{- $repo := $img.repository | toString -}}
{{- $first := first (splitList "/" $repo) -}}
{{- $hasHost := and (contains "/" $repo) (or (contains "." $first) (contains ":" $first) (hasPrefix "<" $first) (eq $first "localhost")) -}}
{{- $registry := $img.registry | default "" -}}
{{- if and (not $registry) (not $hasHost) -}}
{{- $registry = $g.imageRegistry | default "" -}}
{{- end -}}
{{- $ref := ternary (printf "%s/%s" (trimSuffix "/" $registry) $repo) $repo (ne $registry "") -}}
{{- $tag := (required "global.backend.image.tag is required" (include "spark-backend-pool.imageTag" .)) -}}
{{- if and $img.digest (eq $tag ($img.tag | toString)) -}}
{{- printf "%s:%s@%s" $ref $tag $img.digest -}}
{{- else -}}
{{- printf "%s:%s" $ref $tag -}}
{{- end -}}
{{- end }}

{{/*
Pod security of the pools: the restricted Pod Security Standard unless
switched off (pool podSecurity.restricted, else global.backend.podSecurity
.restricted, else global.podSecurity.restricted, else true): non-root uid/gid
65532 (the modulith image's user), RuntimeDefault seccomp, no privilege
escalation, all capabilities dropped, read-only root filesystem with an
emptyDir on /tmp. global.backend.podSecurityContext / securityContext and the
pool's own podSecurityContext / securityContext override single keys.
*/}}
{{- define "spark-backend-pool.restricted" -}}
{{- $g := .Values.global | default dict -}}
{{- $on := true -}}
{{- range $v := list ($g.podSecurity | default dict).restricted ((($g.backend | default dict).podSecurity) | default dict).restricted (.Values.podSecurity | default dict).restricted -}}
{{- if not (kindIs "invalid" $v) -}}{{- $on = $v -}}{{- end -}}
{{- end -}}
{{- if $on -}}true{{- end -}}
{{- end }}

{{- define "spark-backend-pool.podSecurityContext" -}}
{{- $b := ((.Values.global | default dict).backend | default dict) -}}
{{- $d := dict -}}
{{- if include "spark-backend-pool.restricted" . -}}
{{- $d = dict "runAsNonRoot" true "runAsUser" 65532 "runAsGroup" 65532 "seccompProfile" (dict "type" "RuntimeDefault") -}}
{{- end -}}
{{- with mergeOverwrite $d (deepCopy ($b.podSecurityContext | default dict)) (deepCopy (.Values.podSecurityContext | default dict)) -}}
{{- toYaml . -}}
{{- end -}}
{{- end }}

{{- define "spark-backend-pool.containerSecurityContext" -}}
{{- $b := ((.Values.global | default dict).backend | default dict) -}}
{{- $d := dict -}}
{{- if include "spark-backend-pool.restricted" . -}}
{{- $d = dict "allowPrivilegeEscalation" false "capabilities" (dict "drop" (list "ALL")) "readOnlyRootFilesystem" true -}}
{{- end -}}
{{- with mergeOverwrite $d (deepCopy ($b.securityContext | default dict)) (deepCopy (.Values.securityContext | default dict)) -}}
{{- toYaml . -}}
{{- end -}}
{{- end }}

{{/*
Pods mount a ServiceAccount token only when asked: pool serviceAccount
.automount, else global.backend.serviceAccount.automount, else
global.serviceAccount.automount, else false.
*/}}
{{- define "spark-backend-pool.automountToken" -}}
{{- $g := .Values.global | default dict -}}
{{- $on := false -}}
{{- range $v := list (($g.serviceAccount | default dict).automount) ((($g.backend | default dict).serviceAccount | default dict).automount) ((.Values.serviceAccount | default dict).automount) -}}
{{- if not (kindIs "invalid" $v) -}}{{- $on = $v -}}{{- end -}}
{{- end -}}
{{- $on -}}
{{- end }}
