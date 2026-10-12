#!/bin/sh
# Shared build step for the Python service and module images (builder stage).
#
# Installs the uv version used to resolve uv.lock in every Python image. Change
# the version here only; all image builds pick it up.
set -eux

UV_VERSION=0.9.6

pip install "uv==$UV_VERSION"
