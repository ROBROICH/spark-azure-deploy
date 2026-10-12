#!/usr/bin/env bash
# Tools of the db-init test container (image postgres:16-bookworm, which brings
# bash, psql, pg_dump and pg_restore 16): python3 with PyYAML, curl, helm and
# zed. Used by the CI job (before_script) and by the local pod in
# db-init-test.sh.
set -euo pipefail
HELM_VERSION=${HELM_VERSION:-v4.3.0}
ZED_VERSION=${ZED_VERSION:-1.2.1}
arch=$(dpkg --print-architecture)   # amd64 | arm64

apt-get update -qq >/dev/null
apt-get install -y -qq --no-install-recommends ca-certificates curl python3 python3-yaml >/dev/null
curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${arch}.tar.gz" \
  | tar xz -C /usr/local/bin --strip-components=1 "linux-${arch}/helm"
curl -fsSL "https://github.com/authzed/zed/releases/download/v${ZED_VERSION}/zed_${ZED_VERSION}_linux_${arch}_gnu.tar.gz" \
  | tar xz -C /usr/local/bin zed
helm version --short
zed version --skip-server-version 2>/dev/null | head -1 || true
