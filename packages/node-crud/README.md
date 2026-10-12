# TypeScript node CRUD

Most of what SPARK stores for a project is review data that belongs to one project version, such as chapters of the decision draft, risks, arguments, plausibility notes, feedback, and the legal structure. The code calls each such row a node. `@spark-workflow/node-crud` gives every feature the same columns, routes, and version handling for its nodes.

## Core Features

- Every node row stores its project version, whether it is deleted, whether it is outdated, and whether the AI or a person changed it last. History tables keep every earlier state for the protocol.
- A feature lists its node tables in a descriptor. The request and response formats of the API are derived from the Drizzle table definitions, so a new column changes the API without extra code.
- Each feature gets the same routes to list nodes, read several nodes at once, and change several nodes at once. It also gets generated REST routes of the newer v2 API for each kind of node.
- One update request can add, change, and delete nodes in one transaction. It first checks that the project version can still be changed and writes the history entries with the change.
- When core creates a new project version, it copies each feature's nodes into it and marks the ones that need a new analysis as outdated.

## Architecture

### Overview

#### What a node is

A node is one row in a feature table whose rows belong to a project version. All node tables have these columns:

| Column | Meaning |
| --- | --- |
| `id`, `projectVersion` | Primary key. The same node has the same `id` in every version. |
| `projectId` | The project |
| `isDeleted` | The row counts as deleted but stays in the table |
| `isOutdated` | The node's source changed in this version, so its analysis must run again |
| `updateType` | `automated` if the AI wrote it last, `manual` if a person did |
| `frontendParentIds` | The node's parents across features, written as `<type>:<id>` |
| `sys_period` | The time span in which this state of the row is valid. The `<table>_history` table holds earlier states. |

Features use `updateType` to protect reviewers' work. For example, a new AI result for the legal review keeps manual found passages.

#### Descriptors and runtimes

A descriptor lists the node tables of a feature. It only adds what Drizzle cannot read from the table definitions, such as rules for single fields, value conversions, and changes to the generated formats. Feedback stores its rating in upper case and exposes it in lower case:

```ts
export const feedbackDescriptor = defineNodeDescriptor({
	name: "feedback",
	auditLogEnabled: true,
	schema: feedbackSchema,
	nodeMetadata: {
		feedback: {
			fieldRules: { rating: lowerCaseEnumRule },
			schemaOverrides: {
				response: { rating: FeedbackRatingSchema },
				insert: { rating: FeedbackRatingSchema, frontendParentIds: Type.Optional(FeedbackParentIdsSchema) },
				patch: { rating: Type.Optional(FeedbackRatingSchema), frontendParentIds: Type.Optional(FeedbackParentIdsSchema) },
			},
		},
	},
})

export const feedbackNodesProvider = provide({
	resource: FeedbackNodes,
	needs: { postgres: PostgreSQL, projects: Projects },
	make: ({ postgres, projects }) =>
		bindNodeRuntime(feedbackDescriptor, {
			persistence: postgres.scope(feedbackSchema),
			versionPeer: projects,
		}),
})
```

`defineNodeDescriptor` checks the descriptor against the tables when the module loads. It fails if the system columns are missing or if declared fields, rules, or parent fields do not match the table. `bindNodeRuntime` binds the descriptor to a PostgreSQL scope and to `Projects`, which answers version questions.

#### Routes and writes

`createNodeRoutes` publishes three routes:

- `GET /:projectId/nodes` lists all nodes of a project version. It runs one `UNION ALL` query over the node tables and streams the rows.
- `POST /:projectId/batch-nodes` reads nodes by ID.
- `POST /:projectId/update` inserts, updates, and deletes nodes in one transaction. Pass `{ addUpdateEndpoint: false }` to publish only the two read routes.

The two read routes use the latest project version unless the query sets `projectVersion`. The update route requires `projectVersion`. The backend's API reference at `/openapi` lists these routes for each feature, with the request and response formats of its kinds of nodes.

A write first checks the project version. It fails if core is creating a new version or if the version is no longer the latest one. A feature can add `prepareMutation` for its own rules. It runs inside the transaction after that check, sees the parsed changes with their final IDs, and either rejects them or returns changed ones. The package checks the returned changes against the formats again before it writes. The changed rows, the rows marked as deleted, the history rows, and the change history entries are saved or rolled back together.

`defineNodeEntities` and `createNodeEntityResourceRoutes` generate the REST routes of the newer v2 API for each kind of node. All of them share paging, filters, the project version, and the permission rules in `nodeV2AuthPolicies`.

#### Version copy and undo

The versioning Resource of each feature implements `NodeVersionService`. When core creates a project version, for example after the applicant hands in changed plans, it calls `copyVersion` on each feature. The copy keeps node IDs, sets the new `projectVersion`, and resets `isDeleted`, `createdAt`, and `updatedAt`. Core decides per node what to do: it drops nodes of deleted files and marks nodes derived from changed documents as outdated. The next AI run then processes only the outdated parts.

If creating the version fails, core calls `undoVersion`. It deletes the nodes of the new version. It only works while the new version is not yet the latest version of the project.

The package has no database connections of its own and no central list of nodes. Each feature brings its own tables and its query scope.

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the workspace through the [root setup guide](../../README.md#getting-started).

### Environment Variables

The library reads no variables at runtime. `NODE_CRUD_TEST_URL` selects a migrated database for the database tests.

### Running the Module / Service

The library runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../02-backend/apps/spark-backend/README.md#running-the-module--service). [Feedback](../../02-backend/features/feedback_service/src/node.ts) shows a complete descriptor. [Formal Completeness](../../02-backend/features/formal_completeness_check/src/index.ts) shows a feature that publishes only the read routes.

## Testing

From this directory:

```sh
pnpm test
pnpm typecheck
```

To test against a real database, set `NODE_CRUD_TEST_URL` to a database with the backend migrations and run `pnpm test:postgres`.
