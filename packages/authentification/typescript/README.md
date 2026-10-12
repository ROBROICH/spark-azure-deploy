# TypeScript authentication

`@spark-workflow/authentification` decides who is calling the backend and what they may do. People sign in through Keycloak and send the token they get with each request. Services inside the cluster prove who they are with a certificate that the cluster network adds to their requests. What a caller may do in a project comes from SpiceDB.

## Core Features

- A request with a login token comes from a person with the role `admin` or `user`. A request without a token but with an allowed service certificate comes from a service, which gets the role `service`.
- Every route with a `:projectId` in its path first checks that the caller may read that project.
- A route declares the roles, services, or project permissions it needs, for example `update` to change data or `export` to export a decision.
- When a route only learns which object it works on while it runs, it calls `auth.authorize` to apply the same rules, or asks for the list of objects the caller may see.

## Architecture

### Overview

#### Callers

A person sends `Authorization: Bearer <token>`. The plugin checks the token against the signing keys that Keycloak, the OIDC login server, publishes, and takes the user's roles from the token.

A service sends no token. The service mesh, the network layer of the cluster, adds the `x-forwarded-client-cert` header. It holds the caller's identity in the SPIFFE format, `spiffe://<trust domain>/ns/<namespace>/sa/<service account>`. The ID must match `AUTH_ALLOWED_MACHINE_IDENTITIES`, a comma-separated list in which `*` matches any text. An allowed service gets the role `service`. Only such a service may pass on who started an action, for example the user behind a workflow.

#### Project permissions

The roles say what kind of caller it is. Project permissions say what the caller may do in one project. They come from SpiceDB, where a user is an `owner`, `member`, or `auditor` of a project. The [Identity Management README](../../../02-backend/features/identity_management_service/README.md#project-permissions) lists what each of these roles allows.

#### Route guard and policies

Mount the plugin before the routes. From then on, every route needs a verified identity. Every route with `:projectId` in its path also needs the project `read` permission before its own policy runs. The `admin` and `service` roles bypass that read check. Project IDs in the query string or body are not checked automatically.

Add an `auth` policy for anything beyond that:

```ts
import { authentication } from "@spark-workflow/authentification"

const projectUpdate = {
	permissions: [{ resource: "project", permission: "update", path: "projectId" }],
	bypassRoles: ["admin", "service"],
} as const

app.use(authentication).patch("/projects/:projectId", handler, { auth: projectUpdate })
```

The [HTTP host](../../http-host/README.md) mounts the plugin for all backend features, so features only declare policies.

#### Checks inside a handler

The request value `auth` carries the verified identity in `auth.user` and these checks:

- `auth.authorize(...)` checks a permission on a resource the handler found itself.
- `auth.readProject(projectId)` applies the project read rule. Only `admin` and `service` may read a `null` project.
- `auth.readableProjectIds()` lists the readable projects. It returns `undefined` when `auth.readsEveryProject` is true.
- `auth.listableProjectIds()` lists the projects to show in a project list. It returns `undefined` only for `admin`, so a service lists only the projects SpiceDB grants it.
- `auth.accessibleResourceIds(...)` lists resources lazily.

They return `better-result` values with structured Evlog errors. Authentication errors keep their HTTP status and message, and a `401` adds `WWW-Authenticate: Bearer`.

#### Modes

`AUTH_MODE=strict` verifies every request and needs the OIDC settings. `AUTH_MODE=disabled` skips authentication for local fixtures and tests. Never use it in a deployment.

## Getting Started

### Prerequisites

Set up Bun, pnpm, Keycloak, and SpiceDB through the [root setup guide](../../../README.md#getting-started).

### Environment Variables

`parseAuthConfig` reads these settings:

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `AUTH_MODE` | `strict` or `disabled` | `strict` | no |
| `AUTH_BASE_URL` | OIDC provider base URL | none | in strict mode |
| `AUTH_REALM` | OIDC realm | none | in strict mode |
| `AUTH_AUDIENCE` | Accepted token audience | none | in strict mode |
| `AUTH_JWKS_URL` | JWKS URL, if not derived from the provider | derived from the provider | no |
| `AUTH_ALGORITHMS` | Accepted signing algorithms | `RS256` | no |
| `AUTH_SPICE_DB_ENDPOINT`, `AUTH_SPICE_DB_TOKEN` | SpiceDB address and key. Set both, or neither if no route checks project permissions. | none | for permission checks |
| `AUTH_SPICE_DB_CERT_PATH` | SpiceDB TLS certificate | none | no |
| `AUTH_SPICE_DB_INSECURE` | Turn off TLS to SpiceDB | `false` | no |
| `AUTH_ALLOWED_MACHINE_IDENTITIES` | Comma-separated SPIFFE IDs of allowed services, `*` as wildcard | empty | for service callers |

### Running the Module / Service

The library runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../../02-backend/apps/spark-backend/README.md#running-the-module--service).

## Testing

From this directory:

```sh
pnpm test
pnpm typecheck
```
