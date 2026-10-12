#!/bin/sh
# Shared build step for the Python service and module images (builder stage).
#
# Stages the C++/OpenMP runtime libraries needed by compiled wheels (grpcio,
# numpy, scikit-learn, torch, ...) in /extra-libs. The final stage copies that
# directory to /usr/lib. Standard bases (e.g. DHI) already ship these libraries,
# so the copy is a harmless overlay there; the minimal/nix-based final image
# (ZenDiS) omits them.
#
# The architecture is detected at build time so the step works under Kaniko (CI)
# and BuildKit on amd64 and arm64 without the TARGETARCH build argument, which
# Kaniko does not populate. Libraries missing from the builder are skipped.
#
# Usage: stage-runtime-libs.sh [soname ...]
# Without arguments, all of DEFAULT_LIBS are staged.
set -eu

DEFAULT_LIBS="libstdc++.so.6 libgcc_s.so.1 libgomp.so.1"
DEST=/extra-libs

if [ "$#" -eq 0 ]; then
  # shellcheck disable=SC2086 # intentional word splitting of the default list
  set -- $DEFAULT_LIBS
fi

set -x
mkdir -p "$DEST"
ARCHDIR="$(dpkg-architecture -qDEB_HOST_MULTIARCH 2>/dev/null || echo "$(uname -m)-linux-gnu")"
for lib in "$@"; do
  src="$(readlink -f "/usr/lib/$ARCHDIR/$lib" 2>/dev/null || true)"
  [ -n "$src" ] && [ -e "$src" ] || continue
  cp -a "$src" "$DEST/"
  if [ "$(basename "$src")" != "$lib" ]; then
    ln -sf "$(basename "$src")" "$DEST/$lib"
  fi
done
