# Shared HTTP host

`@spark-workflow/http-host` is the shared base for every backend route. It gives each feature a controller, the object that its routes are added to. The controller already handles sign-in checks, database access, the feature's Resources, and project versions. The package also turns errors into HTTP responses of one format. The application adds the routes and controls startup and shutdown.

## Core Features

- Each feature gets an Elysia controller. It checks who is calling, gives the routes the feature's query scope for the database, and hands them exactly the Resources the feature declared.
- A route of a feature that needs `Projects` can set `projectVersion: true`. It then receives the requested version of the project in the path, or the latest version.
- Route handlers return `better-result` values. A success becomes the response body, and an error becomes its HTTP status.
- Every error response is JSON with a `detail` field. When a request does not match the route's format, the response lists each problem with its location.
- Health checks report whether the process is alive, has finished starting, and accepts requests. `/openapi.json` describes every route.

## Architecture

### Overview

#### Feature controllers

The application creates one binding per feature with `createFeatureHttp(resources).for(feature)` and passes it to the feature's route factory. The feature creates its controllers from it:

```ts
export function createEwmsRoutes(http: FeatureHttp<typeof feature>) {
	return http
		.controller("objections-management-service.routes.ewms")
		.group("/:projectId/ewms", (app) =>
			app.get(
				"/processed-file-ids",
				async ({ params, objections, projectVersion }) => ({
					fileIds: await objections.listProcessedFileIds(params.projectId, projectVersion),
				}),
				{ objections: true, projectVersion: true },
			),
		)
}
```

A controller always has:

- authentication from the [authentication package](../authentification/typescript/README.md), including the project read check for `:projectId` routes,
- `postgres`, a [PostgreSQL scope](../postgres/README.md) with only the feature's tables,
- one route option per key in the feature's `needs`. Setting it resolves that [Resource](../resource/README.md) into the handler context.

If the feature needs `Projects`, two more options exist. `projectVersion: true` takes the `projectVersion` query parameter or, if it is missing, the latest version of the project in the path. `latestProjectVersion: true` always uses the latest version.

#### Responses and errors

A handler may return a `better-result` value. Declare the response with `resultOf(schema)`. `Ok` becomes the body, and `Err` is thrown. The host maps errors to JSON with a `detail` field:

| Error | Status |
| --- | --- |
| Evlog error from a feature's error catalog | The status from the catalog |
| Invalid REST query | `400` |
| Unknown route | `404` |
| Request that violates the route schema | `422`, with `detail` listing `type`, `loc`, `msg`, and `input` per issue |
| Anything else | `500` |

The REST helpers parse strict named filters and build pagination metadata for list routes. The generated routes of the v2 API use them, so their query parameters follow the same rules:

- An unknown query parameter returns `400`.
- A single-value parameter, such as `page`, `cursor`, or `projectVersion`, may appear only once.
- A filter parameter may repeat. A row matches if it has any of the given values.
- Different filter parameters must all match.

#### Health checks

`createHttpHostState` tracks the process phase: starting, accepting, or draining. The application marks it accepting once startup is complete.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/healthz` | The process is alive |
| `GET` | `/startup` | `503` while starting |
| `GET` | `/ready` | `200` only while accepting |
| `GET` | `/openapi` | Interactive API documentation |
| `GET` | `/openapi.json` | OpenAPI 3.1 document |

The health checks do not test the database or other services. If such a service is down, the requests that need it fail, while the health checks stay green. Without a state object, `/startup` and `/ready` always succeed.

### Components

| Export | Purpose |
| --- | --- |
| `createHttpHost` | The base app with logging and metrics, OpenAPI, error handling, and health checks |
| `createHttpHostState` | Tracks the starting, accepting, and draining phases |
| `createFeatureHttp` | Binds a feature's Resources and tables to its controllers |
| `resultOf`, REST helpers | Response typing, query filters, and pagination |
| `/migrations` | Applies SQL migrations and provides helpers for the migration lock |
| `/process-output` | Reports process failures and hides sensitive values |

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the workspace through the [root setup guide](../../README.md#getting-started).

### Environment Variables

The host reads no settings of its own. The application owns the bind address, port, database, and feature configuration. Authentication and telemetry read their own shared settings. See the [backend environment](../../02-backend/apps/spark-backend/README.md#environment-variables).

### Running the Module / Service

The library runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../02-backend/apps/spark-backend/README.md#running-the-module--service).

## Testing

From this directory:

```sh
pnpm test
pnpm typecheck
```
