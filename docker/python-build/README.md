# Shared Python image build steps

The Dockerfiles of the Python services and modules in `04-shared-services/` and
`05-modulcluster/` share these build steps. CI builds every image with Kaniko
from the repository root, so each Dockerfile copies this directory into its
builder stage and runs the scripts from there:

```dockerfile
COPY docker/python-build/ /opt/python-build/
RUN sh /opt/python-build/stage-runtime-libs.sh
RUN sh /opt/python-build/install-uv.sh
# ... uv sync ...
RUN sh /opt/python-build/repoint-venv-python.sh <smoke-test modules>
```

The final stage then copies the staged libraries:

```dockerfile
COPY --from=builder /extra-libs/ /usr/lib/
```

| Script | Stage | Purpose |
| --- | --- | --- |
| `stage-runtime-libs.sh [soname ...]` | builder | Copies the C++/OpenMP runtime libraries (default `libstdc++.so.6 libgcc_s.so.1 libgomp.so.1`) to `/extra-libs`. The minimal ZenDiS final image omits them; on standard bases the overlay is harmless. Missing libraries are skipped. |
| `install-uv.sh` | builder | Installs the one uv version used by all images. Change the version only here. |
| `repoint-venv-python.sh [module ...]` | after `uv sync` | Points `/app/.venv/bin/python*` to `/usr/local/bin/python3`, which exists in the builder and the minimal final image, then imports the given modules as a smoke test. Without modules it only checks the interpreter. |

The scripts are POSIX `sh`, detect the architecture at build time, and need no
build arguments, because Kaniko in CI passes none and does not set `TARGETARCH`.

Each image's `Dockerfile.dockerignore` allows `docker/python-build/*.sh`; keep
that entry when adding an image. Every image that uses this directory also
lists `docker/python-build/**/*` in its `changes:` rule in `.gitlab-ci.yml`, so
a change here rebuilds all of them.
