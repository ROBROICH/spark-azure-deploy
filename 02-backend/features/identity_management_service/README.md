# Dienst Identitätsverwaltung (Identity Management Service)

Manages users and who may work on which project. Users and their roles are stored in Keycloak, the login server. What each user may do in a project is stored in SpiceDB, a database for permissions.

## Core Features

- `GET /me` returns the signed-in user and their roles.
- `GET /users` searches the users in Keycloak, for example to add them to a project.
- A project owner sets the full list of owners, members, and auditors of a project in one step. The step either succeeds completely or changes nothing.
- The feature defines in SpiceDB what each project role may do, and it updates that definition when the backend starts.
- Outside production, testers with a special role can switch their own account between `admin` and `user`.

## Architecture

### Overview

#### Project permissions

A user has one of three roles in a project. SpiceDB calls them relations:

| Role | Permissions |
| --- | --- |
| `owner` | `read`, `create`, `update`, `execute`, `delete`, `export`, `assign`, `approve` |
| `member` | `read`, `create`, `update`, `execute`, `delete`, `export` |
| `auditor` | `read`, `audit` |

A user can have a role directly or through a group. The other features check these permissions through the shared authentication package, for example `export` before a decision export.

`POST /assign/projects/:projectId/assignments` needs the `assign` permission and replaces all role assignments of the project in one SpiceDB write. `AUTH_SPICE_DB_BULK_CHUNK_SIZE` limits how many removals and new assignments one replacement may contain. The limit does not raise SpiceDB's own transaction limit. If the connection fails during the write, you cannot know whether it was saved. Reload the assignments before you change them again.

#### Schema revisions

The SpiceDB permission definition (its schema) lives in `src/migrations/schema/` as numbered `.zed` files. At startup, the backend applies every revision that `spicedb_migrations` does not list yet. It then compares SpiceDB with the latest revision and writes it again if they differ. To change permissions, add a new revision file and register it in `src/migrations/revisions.ts`.

#### Role switching

`POST /me/roles` lets testers check the application as `admin` and as `user` with one account. All of these must hold, or the call returns `403`:

- The privileged Keycloak credentials are set.
- `ENV` is `dev`, `development`, `local`, `testing`, or `staging`. The Helm chart deploys `development`.
- `AUTH_REALM` is not `production`.
- The caller's account has the realm role `test-role-switcher` assigned directly. Being `admin` is not enough.

The endpoint only adds and removes `admin` and `user`. It never touches `test-role-switcher`, so a tester can switch to `user`, log in again, and switch back. Realm administrators assign `test-role-switcher` by hand. Do not make it a default role, and do not include it in the `admin` role. The local bootstrap gives it only to `LOCAL_USER_ID`. Each successful switch writes the audit event `identity.USER_ROLES_REPLACE`.

### Dependencies

The feature needs nothing from other features. It provides the `Identity` Resource to itself and to backend startup, which uses it to apply the SpiceDB schema.

| Service | Used for |
| --- | --- |
| Keycloak | Users, realm roles, and role switching |
| SpiceDB | Project relations and permission checks |

### API Endpoints

The backend serves these routes under `/api/identity`.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/me` | Returns the current identity |
| `POST` | `/me/roles` | Switches the caller between `admin` and `user` |
| `GET` | `/users` | Searches users |
| `POST` | `/assign/projects/:projectId/assignments` | Replaces the project's assignments |

## Getting Started

### Prerequisites

Set up Bun, pnpm, Keycloak, and SpiceDB through the [root setup guide](../../../README.md#getting-started).

### Environment Variables

`src/env.ts` reads these settings:

| Variable | Description | Default | Required |
| --- | --- | --- | --- |
| `ENV` | Environment name. Only `dev`, `development`, `local`, `testing`, and `staging` allow role switching. | none | no |
| `AUTH_BASE_URL` | Keycloak base URL | `http://localhost:9090` locally | yes |
| `AUTH_REALM` | Keycloak realm | `local` locally | yes |
| `AUTH_CLIENT_ID` | Keycloak client | `local-client` locally | yes |
| `AUTH_CLIENT_SECRET` | Keycloak client secret | from the root `.env` | yes |
| `AUTH_SPICE_DB_ENDPOINT` | SpiceDB endpoint | `localhost:50051` locally | yes |
| `AUTH_SPICE_DB_TOKEN` | SpiceDB pre-shared key | from the root `.env` | yes |
| `AUTH_SPICE_DB_INSECURE` | Turn off TLS to SpiceDB | `true` locally | yes |
| `AUTH_SPICE_DB_BULK_CHUNK_SIZE` | Largest number of removals and new assignments in one replacement | `1000` locally | yes |
| `AUTH_SPICE_DB_CERT_PATH` | SpiceDB TLS certificate | none | no |
| `AUTH_PRIVILEGED_REALM`, `AUTH_PRIVILEGED_CLIENT_ID`, `AUTH_PRIVILEGED_CLIENT_SECRET` | Keycloak credentials for role switching. Set all three or none. | `local`, `local-client`, and the root `.env` secret locally | no |

### Running the Module / Service

The package runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../apps/spark-backend/README.md#running-the-module--service).

## Testing

From this package directory:

```sh
pnpm test
pnpm typecheck
```

The role-switch test runs the real identity feature against local Keycloak and PostgreSQL through `app.handle`, without an HTTP server. Both URLs must be loopback addresses. It creates its own accounts and deletes them afterward:

```sh
IDENTITY_ROLE_NATIVE_TEST=true pnpm test test/role-switch-authorization.test.ts
```

The test needs `IDENTITY_ROLE_DATABASE_URL`, `AUTH_MODE=strict`, `AUTH_AUDIENCE`, and the settings above, including the privileged credentials. The login client must allow direct access grants. If the privileged client cannot create roles, create `test-role-switcher` in the local realm first. Do not give the application client more permissions for the test.
