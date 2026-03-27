FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir \
    "litellm[proxy]==1.80.10" \
    "google-cloud-aiplatform>=1.38,<2.0.0" \
    "google-auth==2.41.1" \
    "prometheus_client==0.24.1"

COPY entrypoint.py /app/entrypoint.py
RUN chmod +x /app/entrypoint.py

COPY config.yaml /app/config.yaml

# Align with nonroot user (UID 65532) from hardened DHI base images
RUN id -u nonroot >/dev/null 2>&1 || \
    (groupadd --gid 65532 nonroot && \
     useradd --uid 65532 --gid nonroot --no-create-home --shell /sbin/nologin nonroot)
RUN chown -R nonroot:nonroot /app

USER nonroot

ENTRYPOINT ["/app/entrypoint.py"]
