![SPARK Logo](./images/SPARK-Logo.png)

# SPARK Workflow 

Welcome to the repository of the application **SPARK Workflow**!

A detailed description of the project **SPARK** and the features of **SPARK Workflow** can be found on [openCode](https://opencode.de/de/software/spark-workflow-10117). Additional information for public authorities can be found on the [website](https://bmds.bund.de/themen/kuenstliche-intelligenz/ki-in-der-verwaltung/spark) of the BMDS.

For step-by-step guidance on using the application, see the [user manual (DE)](./docs/Benutzerhandbuch_GER_v1.pdf). If you are interested in operating the solution, [the technical product data sheet (DE)](./docs/Technischer_Produktsteckbrief_GER_v1.pdf) is a good starting point. An overview of all documentation in this repository is available in the [documentation index](./docs/README.md).

**SPARK Workflow** was released as open source in consecutive releases. For more information, see [roadmap.md](./docs/roadmap.md).

> [!WARNING]
> Please note the security notice below.

## What it is, what it isn’t

**SPARK Workflow is ...**

* an operational assistance tool for complex administrative planning and permitting procedures. It helps public authorities handle large volumes of application materials, prepare information for review, and support key steps of the procedure.

* based on initial concepts from the use cases of approval procedures for federal highways or hydrogen pipelines (Planfeststellungsverfahren für Bundesfernstraßen oder im Bereich des Wasserstoffkernnetzes). Due to its configurability and modular architecture, it can be adapted to other use cases.

* built to reduce administrative workload while keeping humans in control and accountable. Every AI output has to be actively accepted, edited, or discarded.

* distinctive in embedding AI directly into the authority’s established, legally grounded working process. Results are shown in a user interface designed together with the officials who use it.

**SPARK Workflow is not ...**

* an autonomous system. It supports decision-making but does not decide on its own, and no output takes effect without human review.

* infallible. AI is probabilistic and makes mistakes, just as people do. Which is why human oversight is part of every step.

## Architecture
SPARK Workflow is implemented as a containerized service architecture and is natively designed to run on any Kubernetes-compatible infrastructure. See the [system architecture (GER)](./docs/system-architecture) for more information.

## Getting Started

### Prerequisites

- Docker with Docker Compose
- [uv](https://docs.astral.sh/uv/getting-started/installation/)
- [Process Compose](https://f1bonacc1.github.io/process-compose/installation/)
- Node.js 24 and pnpm 10.30.2 for the frontend
- An OpenAI-compatible LLM provider, for example LiteLLM
- A Docling Serve endpoint

### Dependencies

The local development stack provides the shared platform services used by the modules:

- Temporal for workflow execution and the workflow UI
- MinIO/S3 for document and object storage
- Qdrant for vector storage
- PostgreSQL-backed application databases
- Keycloak, SpiceDB, Redis, and the shared backend services configured in Docker Compose and Process Compose

The local setup starts shared infrastructure with Docker Compose and runs the application services, workers, seed jobs, and frontend on the host with Process Compose.

### External AI Services

The local stack does not start an LLM provider. During secret generation, provide an OpenAI-compatible base URL, API key, chat model, and embedding model.

Document extraction also requires Docling Serve. You can point the setup at an existing Docling deployment, or run a local CPU container:

```bash
docker run -d --name spark-docling-cpu \
  -p 5001:5001 \
  -e DOCLING_NUM_THREADS=4 \
  -e OMP_NUM_THREADS=4 \
  -e DOCLING_SERVE_ENABLE_UI=1 \
  -e DOCLING_SERVE_MAX_DOCUMENT_TIMEOUT=3600 \
  -e DOCLING_SERVE_MAX_SYNC_WAIT=3600 \
  -e DOCLING_SERVE_LOAD_MODELS_AT_BOOT=True \
  quay.io/docling-project/docling-serve-cpu:latest
```

When using the local container, enter these Docling values in the secret generation prompt:

- Protocol: `http`
- Host: `localhost`
- Port: `5001`
- OCR engine: an engine supported by your Docling Serve image, for example `rapidocr`

### First Local Start

Generate the private root `.env` file first. The script prompts for the email and password of your local login user, then for external provider settings, and generates shared local infrastructure secrets. The login user is created automatically in the local Keycloak when the infrastructure starts. The script refuses to overwrite an existing `.env`. If you regenerate it later, wipe the Docker containers and volumes before starting again, because Postgres, MinIO, Temporal, and SpiceDB persist the old credentials.

```bash
uv run poe create-secrets
```

Install frontend dependencies:

```bash
cd 01-frontend/frontend
corepack enable
pnpm install --frozen-lockfile
cd ../..
```

Start shared infrastructure:

```bash
docker compose --env-file .env up --wait
```

Start application services and the frontend:

```bash
uv run poe process-compose
```

Process Compose loads the root `.env` by default. Keep it limited to shared local secrets and external provider credentials. Service-specific application settings stay in each service’s tracked `.env.local` file, with explicit local aliases in `process-compose.yaml` where a service expects a different environment variable name.

The startup automatically runs the seed jobs needed for a fresh local system:

- `project-logic-seed` inserts default project status and project type rows.
- `formal-completeness-seed` inserts FCS template categories and document types.
- `administrative-file-draft-seed` inserts the default VAE template from `src/scripts/data/vae_nodes.json`.

The law database (gesetze-normen) is seeded with `scripts/data/gesetze-normen-seed.sql.gz` when Postgres initializes a fresh volume. The plausibility checks rely on this data.

### Open the Application

Open the frontend at:

```text
http://localhost:3000/app/
```

You are redirected to the local Keycloak login. Sign in with the email and password you chose during `uv run poe create-secrets`.

Useful local endpoints:

- Frontend: `http://localhost:3000/app/`
- Keycloak admin console: `http://localhost:9090`
- Temporal UI: `http://localhost:8233`
- MinIO console: `http://localhost:9001`
- Qdrant API: `http://localhost:6333`
- Process Compose API: `http://localhost:8080`

### Running behind a reverse proxy (`$WEB_HOST`)

The local stack assumes the browser and the containers share `localhost`. Setting the
`$WEB_HOST` variable signals that the stack runs behind a port-prefixing reverse proxy instead:
the browser is remote and reaches each service through `https://<port>-$WEB_HOST`, so every
**browser-facing** URL (the frontend, the Keycloak login redirect, and object-storage presigned
URLs) must use that public host instead of `localhost`.

This is handled automatically: when `$WEB_HOST` is set, `scripts/create_secrets.sh` writes the
public base URLs into `.env`, and `docker-compose.yaml` / `process-compose.yaml` pick them up. No
manual edits are needed — just run the normal flow on the proxied host:

```bash
uv run poe create-secrets        # detects $WEB_HOST, writes FRONTEND_PUBLIC_URL / KEYCLOAK_PUBLIC_URL / S3_PUBLIC_URL
docker compose --env-file .env up --wait
uv run poe process-compose
```

Then open `https://3000-$WEB_HOST/app/` (not `localhost:3000`).

What changes vs. localhost:

- **Keycloak** advertises `https://9090-$WEB_HOST` as its issuer; oauth2-proxy uses the public
  host for the browser-facing (front-channel) login/redirect, while token redeem and JWKS stay on
  the internal docker network (`keycloak:9090`) so they never traverse the authenticating proxy.
- **Object storage** is served **same-origin** through oauth2-proxy (the `/dms-local/` route),
  because an authenticating reverse proxy blocks the cross-origin CORS preflight a direct upload
  to a separate MinIO port would trigger. Presigned URLs use path-style addressing so the
  signature validates behind the proxy.

If you regenerate `.env` after moving between a plain-localhost and a reverse-proxy setup, wipe the Docker volumes
first (as for any `.env` regeneration). Override the Vite host allow-list with
`VITE_DEV_ALLOWED_HOSTS` if you serve the frontend under a different domain.

### Run a Workflow

Use the normal frontend workflow:

1. Open `http://localhost:3000/app/` and sign in.
2. Create a Verfahren.
3. Upload a ZIP file in the Unterlagen area.
4. Click `Zum Verfahren`.
5. On the `Formale Vollständigkeitsprüfung` page, click `KI-Analyse starten`.
6. Follow progress in the frontend or in [Temporal UI](http://localhost:8233).

The formal completeness check workflow runs document extraction, result insertion, Qdrant indexing, document-type matching, table-of-contents matching, and plausibility checks.

### Docker Base Images

By default, the Python service Dockerfiles use `python:3.13-slim` from Docker Hub (no login required). The base images are defined as build arguments in the first lines of each Dockerfile, where `BASE_IMAGE_DEV` is used by the build stages and `BASE_IMAGE` is the final runtime image:

```dockerfile
ARG BASE_IMAGE_DEV=python:3.13-slim
ARG BASE_IMAGE=python:3.13-slim
```

To use Docker Hardened Images instead, replace these defaults with images from `dhi.io/python`. The build stages need the `-dev` variant, which includes a shell and package manager. This requires a prior `docker login dhi.io` with valid credentials:

```dockerfile
ARG BASE_IMAGE_DEV=dhi.io/python:3.13.13-debian13-dev
ARG BASE_IMAGE=dhi.io/python:3.13.13-debian13
```

Alternatively, override the build arguments at build time without editing the Dockerfile. The build context is the repository root:

```bash
docker build \
  -f 02-backend/examination_service/Dockerfile \
  --build-arg BASE_IMAGE_DEV=dhi.io/python:3.13.13-debian13-dev \
  --build-arg BASE_IMAGE=dhi.io/python:3.13.13-debian13 \
  .
```

## Security Notice
> [!WARNING]
>This project provides a full-stack application for AI-assisted planning and approval workflows, including frontend, AI processing modules, and supporting backend services. It is designed to integrate into an existing platform infrastructure and to leverage the services and security controls already established within that platform. It does not include a self-contained, production-ready security configuration.
>
>The application is developed and maintained with security in mind. A production deployment depends on platform infrastructure components outside the scope of this repository. The operator is responsible for providing, configuring, and hardening these components in accordance with applicable policies and the risk profile of the target environment. This includes, among others:
>- **Identity & Authorization**: Integration with an OIDC- and OAuth 2.0-compliant identity and authorization service and IAM. Roles and permissions are defined within the application and may require adaptation to internal requirements.
>- **Service Communication**: Deployment within an mTLS-capable service mesh. TLS certificate lifecycle management at the platform level.
>- **Secrets & Key Management**: All secrets, credentials, and cryptographic keys must be managed via a dedicated platform-level solution.
>- **Data Storage**: The application uses PostgreSQL, S3-compatible object storage and Redis. Infrastructure-level encryption of all storage backends is assumed. Additional encryption at the application or field level must be implemented as required by the operator’s crypto concept.
>- **Observability**: The application exposes Prometheus-compatible metrics and supports OpenTelemetry-compatible telemetry. The application provides an audit log covering user actions and AI operations. Central aggregation, forwarding, and evaluation of logs must be provided by the operator’s observability platform.
>
>Beyond infrastructure components, the operator is solely responsible for the secure and orderly operation of the deployment. This includes, among others:
>- **Access Control & Administration**: Restricting access to internal services, administrative interfaces, and management endpoints to authorized personnel and systems only. Applying the principle of least privilege throughout.
>- **Network Security**: Enforcing IP allowlisting, network segmentation, and firewall rules appropriate to the target environment. Configuring security-relevant HTTP response headers (e.g. Content-Security-Policy, Strict-Transport-Security, X-Frame-Options) at the edge.
>- **Resource & Capacity Management**: Ensuring that storage volumes, databases, log targets, and message queues do not exhaust available capacity. Implementing appropriate retention policies, log rotation, and alerting.
>- **Monitoring & Incident Response**: The application’s built-in audit log provides a record of user and AI activity but does not replace centralized log aggregation and analysis. Operating monitoring, alerting, and centralized log evaluation for all relevant system components. Establishing and maintaining incident response and escalation processes is the responsibility of the operator.
>- **Patch & Vulnerability Management**: Keeping all platform components, base images, and dependencies up to date. Tracking relevant security advisories and applying patches in a timely manner.
>- **Backup & Recovery**: Implementing and regularly testing backup and disaster recovery procedures for all stateful components.
>
>Default values, example configurations, and supporting scripts are provided for development, testing, and integration purposes only and must not be used in production without review and adaptation. A dedicated security review of the full deployment is required before use in any non-development environment. Secure operation is the sole responsibility of the respective operator.

## Troubleshooting

<details>
<summary>PostgreSQL won’t start / application services are crashing</summary>

This is most likely because the `.env` file with secrets hasn’t been created yet. Create it by running:

```bash
./scripts/create_secrets.sh
```

Then restart all containers. If the `.env` already exists and you want to regenerate it, delete it first and re-run the script. You then need to clear all volumes and then rebuild the entire stack.

</details>

<details>
<summary>Temporal UI: “missing csrf token in request header”</summary>

The Temporal UI sets its CSRF cookie with the `Secure` flag. Some browsers drop `Secure` cookies over plain HTTP, which prevents the CSRF token from being sent with API requests.

To fix this, add `TEMPORAL_CSRF_COOKIE_INSECURE=true` to the `temporal-ui` service in `docker-compose.yaml`:

```yaml
temporal-ui:
  environment:
    - TEMPORAL_ADDRESS=temporal:7233
    - TEMPORAL_CSRF_COOKIE_INSECURE=true
```

Then recreate the container:

```bash
docker compose up -d temporal-ui
```
</details>

<details>
<summary>Why does Temporal store large intermediate states externally in S3
and pass only references to the workflows?</summary>

In SPARK Workflow, Temporal stores its data in Postgres. Postgres can work with large amounts of data, but it’s not recommended. Because of that, we made the deliberate design decision to enforce a 2MB limit on inputs and outputs in Temporal.

Note: The AI-assisted steps in SPARK Workflow are not a low-latency solution. Workflows can run over several hours. In this context, the latency produced by the coupling of the Temporal Workflows and S3 is negligible.

</details>

<details> 
<summary>The state-management of the local setup is fragile due to poor decoupling of configuration and persistent state.</summary>
    
The Docker setup is intended as a low-barrier entry point for getting started with SPARK Workflow. Its goal is to make testing SPARK Workflow as easy as possible. It is explicitly not production ready and not designed for a long-term setup. To deploy SPARK Workflow in a production environment, use the [Helm charts](./helm/README.md).
</details>

<details> 
<summary>The source code does not allow legal norms to be generated or updated independently from primary sources.</summary>

The [Laws and Norms Database service](04-shared-services/db-services/gesetze-normen-db-service) makes it possible to retrieve and update legal norms from public federal and state law databases using parsers. Further information can be found in the [README](04-shared-services/db-services/gesetze-normen-db-service/README.md).

For the first local setup, a database seed for the Gesetze- und Normendatenbank (Law and Norm Database) has been provided. This was done to decrease the barrier to entry for the open-source community. This is **not a production-ready configuration**. Please note the security notice above for more information.

</details>

## License

This project is licensed under the EUPL-1.2.

It also includes third-party components under other open source licenses.
See [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES/THIRD_PARTY_LICENSES.md) for details.
