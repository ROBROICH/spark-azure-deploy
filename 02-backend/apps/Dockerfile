ARG BASE_IMAGE_DEV=oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4
ARG BASE_IMAGE=gcr.io/distroless/cc-debian13:nonroot@sha256:08476c244888bfb425bae1ae4dd7c17f093e972aab8426883d97f3c6f280f7c1

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
