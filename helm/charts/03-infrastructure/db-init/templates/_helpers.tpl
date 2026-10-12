{{/*
Namespace: namespaceOverride > global.namespaceOverride > release namespace.
*/}}
{{- define "db-init.namespace" -}}
{{- coalesce (.Values.namespaceOverride | default "" | toString) (((.Values.global | default dict).namespaceOverride) | default "" | toString) .Release.Namespace -}}
{{- end }}

{{- define "db-init.fullname" -}}
{{- printf "%s-db-init" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "db-init.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: db-init
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with ((.Values.global | default dict).stage | default dict).name }}
environment: {{ . | quote }}
{{- end }}
{{- end }}

{{/*
Databases that asked for an action, resolved: list of dicts with key, name,
owner, create, drop, url. Validates the switches and the guard.
*/}}
{{- define "db-init.databases" -}}
{{- $root := . -}}
{{- $out := list -}}
{{- if not .Values.teardown.enabled -}}
{{- range $key, $raw := .Values.databases -}}
{{- $db := mergeOverwrite (deepCopy $root.Values.defaults) ($raw | default dict) -}}
{{- if ne (toString (dig "enabled" true $db)) "false" -}}
{{- $name := tpl (toString (required (printf "db-init: databases.%s.name is required" $key) $db.name)) $root -}}
{{- $owner := tpl (toString ($db.owner | default "")) $root -}}
{{- $dump := tpl (toString ($db.dump | default "")) $root -}}
{{- $restore := eq (toString $db.restore) "true" -}}
{{- if and $restore (not $dump) -}}
{{- if hasKey ($raw | default dict) "restore" -}}
{{- fail (printf "db-init: databases.%s.restore is set but no dump URL is configured" $key) -}}
{{- end -}}
{{- /* a chart-wide request (defaults.restore) skips databases without a dump */ -}}
{{- $restore = false -}}
{{- end -}}
{{- $url := ternary $dump "" $restore -}}
{{- $drop := toString ($db.drop | default "none") -}}
{{- if not (has $drop (list "none" "database" "tables")) -}}
{{- fail (printf "db-init: databases.%s.drop must be none, database or tables (got %q)" $key $drop) -}}
{{- end -}}
{{- $create := eq (toString $db.create) "true" -}}
{{- $extensions := list -}}
{{- range $db.extensions | default list -}}
{{- if not (regexMatch "^[A-Za-z0-9_-]+$" (toString .)) -}}
{{- fail (printf "db-init: databases.%s.extensions: %q is not an extension name" $key (toString .)) -}}
{{- end -}}
{{- $extensions = append $extensions (toString .) -}}
{{- end -}}
{{- if or $create (ne $drop "none") $url $extensions -}}
{{- if not $owner -}}
{{- fail (printf "db-init: databases.%s needs an owner (defaults.owner)" $key) -}}
{{- end -}}
{{- $pattern := tpl (toString ($root.Values.guard.namePattern | default "")) $root -}}
{{- if and $pattern (not (regexMatch $pattern $name)) -}}
{{- fail (printf "db-init: databases.%s: %q does not match guard.namePattern %q — refusing to touch it" $key $name $pattern) -}}
{{- end -}}
{{- if $url -}}
{{- include "db-init.checkDump" (dict "root" $root "what" (printf "databases.%s.dump" $key) "url" $url) -}}
{{- end -}}
{{- $out = append $out (dict "key" $key "name" $name "owner" $owner "create" $create "drop" $drop "url" $url "extensions" (join " " $extensions)) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- toJson $out -}}
{{- end }}

{{/*
A dump URL must be gs:// or https:// and match guard.dumpPattern (the trusted
dump locations, required as soon as anything is restored: a dump runs in the
admin's session).
Call with dict "root" $ "what" <key> "url" <url>.
*/}}
{{- define "db-init.checkDump" -}}
{{- if not (or (hasPrefix "gs://" .url) (hasPrefix "https://" .url)) -}}
{{- fail (printf "db-init: %s must be gs:// or https:// (got %q)" .what .url) -}}
{{- end -}}
{{- $pattern := tpl (toString (.root.Values.guard.dumpPattern | default "")) .root -}}
{{- if not $pattern -}}
{{- fail (printf "db-init: %s is set but guard.dumpPattern is empty — name the trusted dump locations (a regular expression over the URL)" .what) -}}
{{- end -}}
{{- if not (regexMatch $pattern .url) -}}
{{- fail (printf "db-init: %s %q does not match guard.dumpPattern %q" .what (regexReplaceAll "\\?.*$" .url "") $pattern) -}}
{{- end -}}
{{- end }}

{{/*
libpq environment of the admin connection.
*/}}
{{- define "db-init.pgEnv" -}}
- name: PGHOST
  value: {{ required "db-init: connection.host is required" (tpl (toString .Values.connection.host) .) | quote }}
- name: PGPORT
  value: {{ .Values.connection.port | quote }}
- name: PGSSLMODE
  value: {{ .Values.connection.sslmode | default "require" | quote }}
- name: PGUSER
  valueFrom:
    secretKeyRef:
      name: {{ include "db-init.adminSecretName" . }}
      key: {{ .Values.admin.existingSecret.usernameKey | default "username" }}
- name: PGPASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "db-init.adminSecretName" . }}
      key: {{ .Values.admin.existingSecret.passwordKey | default "password" }}
{{- end }}

{{/*
Secret with the admin credentials: admin.existingSecret.name, else the one
the chart materializes from the secret store.
*/}}
{{- define "db-init.adminSecretName" -}}
{{- .Values.admin.existingSecret.name | default (printf "%s-admin" (include "db-init.fullname" .)) -}}
{{- end }}

{{/*
Qdrant collections that asked for a restore, resolved: list of dicts with
key, name, drop, url.
*/}}
{{- define "db-init.collections" -}}
{{- $root := . -}}
{{- $out := list -}}
{{- if not .Values.teardown.enabled -}}
{{- range $key, $raw := (.Values.qdrant.collections | default dict) -}}
{{- $c := $raw | default dict -}}
{{- if ne (toString (dig "enabled" true $c)) "false" -}}
{{- $name := tpl (toString (required (printf "db-init: qdrant.collections.%s.name is required" $key) $c.name)) $root -}}
{{- $snapshot := tpl (toString ($c.snapshot | default "")) $root -}}
{{- $restore := eq (toString (ternary $c.restore $root.Values.defaults.restore (hasKey $c "restore"))) "true" -}}
{{- if and $restore (not $snapshot) (hasKey $c "restore") -}}
{{- fail (printf "db-init: qdrant.collections.%s.restore is set but no snapshot is configured" $key) -}}
{{- end -}}
{{- if and $restore $snapshot -}}
{{- $pattern := tpl (toString ($root.Values.guard.namePattern | default "")) $root -}}
{{- if and $pattern (not (regexMatch $pattern $name)) -}}
{{- fail (printf "db-init: qdrant.collections.%s: %q does not match guard.namePattern %q — refusing to touch it" $key $name $pattern) -}}
{{- end -}}
{{- include "db-init.checkDump" (dict "root" $root "what" (printf "qdrant.collections.%s.snapshot" $key) "url" $snapshot) -}}
{{- $drop := ne (toString (ternary $c.drop $root.Values.defaults.drop (hasKey $c "drop"))) "none" -}}
{{- $out = append $out (dict "key" $key "name" $name "drop" $drop "url" $snapshot) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- toJson $out -}}
{{- end }}

{{/*
Anything to do at all (a database action, a collection restore or a SpiceDB
restore)?
*/}}
{{- define "db-init.active" -}}
{{- if or .Values.teardown.enabled (include "db-init.databases" . | fromJsonArray) (include "db-init.collections" . | fromJsonArray) (and (eq (toString .Values.spicedb.restore) "true") (not .Values.teardown.enabled)) -}}true{{- end -}}
{{- end }}

{{/*
Init container fetching a dump to /work/dump. Call with dict "root" $ "url" <url>.
*/}}
{{- define "db-init.fetchContainer" -}}
- name: fetch
  image: {{ .root.Values.images.fetch }}
  {{- with include "db-init.containerSecurity" .root }}
  {{- . | nindent 2 }}
  {{- end }}
  command: [bash, -ceu]
  args:
    - |
      {{- with .skipFile }}
      [ -f {{ . }} ] && exit 0
      {{- end }}
      case "$DUMP_URL" in
        gs://*)    gcloud storage cp "$DUMP_URL" /work/dump ;;
        https://*) curl -fsSL --retry 3 -o /work/dump "$DUMP_URL" ;;
      esac
      echo "fetched $(stat -c %s /work/dump) bytes from ${DUMP_URL%%\?*}"
  env:
    {{- with include "db-init.homeEnv" .root }}
    {{- . | nindent 4 }}
    {{- end }}
    - name: DUMP_URL
      value: {{ .url | quote }}
  volumeMounts:
    {{- with include "db-init.tmpMount" .root }}
    {{- . | nindent 4 }}
    {{- end }}
    - name: work
      mountPath: /work
  resources:
    {{- toYaml .root.Values.resources | nindent 4 }}
{{- end }}

{{/*
Pod security of the Jobs. podSecurity.restricted (else
global.podSecurity.restricted, else true) applies the restricted Pod Security
Standard: non-root uid/gid 65532, RuntimeDefault seccomp, no privilege
escalation, all capabilities dropped, read-only root filesystem; /tmp is an
emptyDir and HOME points there (gcloud and zed keep their configuration in
HOME). podSecurityContext / securityContext override single keys. No Job
talks to the Kubernetes API: the ServiceAccount token is never mounted.
*/}}
{{- define "db-init.restricted" -}}
{{- $local := (.Values.podSecurity | default dict).restricted -}}
{{- $global := ((.Values.global | default dict).podSecurity | default dict).restricted -}}
{{- $on := true -}}
{{- if not (kindIs "invalid" $local) -}}{{- $on = $local -}}{{- else if not (kindIs "invalid" $global) -}}{{- $on = $global -}}{{- end -}}
{{- if $on -}}true{{- end -}}
{{- end }}

{{- define "db-init.podSecurity" -}}
automountServiceAccountToken: false
{{- $d := dict -}}
{{- if include "db-init.restricted" . -}}
{{- $d = dict "runAsNonRoot" true "runAsUser" 65532 "runAsGroup" 65532 "seccompProfile" (dict "type" "RuntimeDefault") -}}
{{- end -}}
{{- with mergeOverwrite $d (deepCopy (.Values.podSecurityContext | default dict)) }}
securityContext:
  {{- toYaml . | nindent 2 }}
{{- end -}}
{{- end }}

{{- define "db-init.containerSecurity" -}}
{{- $d := dict -}}
{{- if include "db-init.restricted" . -}}
{{- $d = dict "allowPrivilegeEscalation" false "capabilities" (dict "drop" (list "ALL")) "readOnlyRootFilesystem" true -}}
{{- end -}}
{{- with mergeOverwrite $d (deepCopy (.Values.securityContext | default dict)) -}}
securityContext:
  {{- toYaml . | nindent 2 }}
{{- end -}}
{{- end }}

{{- define "db-init.homeEnv" -}}
{{- if include "db-init.restricted" . -}}
- name: HOME
  value: /tmp
{{- end -}}
{{- end }}

{{- define "db-init.tmpMount" -}}
{{- if include "db-init.restricted" . -}}
- name: tmp
  mountPath: /tmp
{{- end -}}
{{- end }}

{{- define "db-init.tmpVolume" -}}
{{- if include "db-init.restricted" . -}}
- name: tmp
  emptyDir: {}
{{- end -}}
{{- end }}
