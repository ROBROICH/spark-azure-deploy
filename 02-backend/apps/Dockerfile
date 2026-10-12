ARG BASE_IMAGE_DEV=oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61
ARG BASE_IMAGE=gcr.io/distroless/cc-debian13:nonroot@sha256:e792ab3d241a468a4fd7519ddbbebe66b49b5f365771716ea688ad40b6c6f1c2

FROM ${BASE_IMAGE_DEV} AS bun-runtime
FROM ${BASE_IMAGE}
WORKDIR /app
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
COPY . /app/
ENTRYPOINT ["/usr/local/bin/bun"]
USER 65532
EXPOSE 8000
STOPSIGNAL SIGTERM
CMD ["/app/index.mjs"]
