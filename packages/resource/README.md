# Resource contracts

A feature in the SPARK backend never reads or writes another feature's tables. When it needs something from another feature, it asks for it by name. That named, typed interface is called a Resource, and the feature that owns the data provides it. Which feature provides which Resource is decided once, when the backend is put together. `@spark-workflow/resource` defines how Resources are declared and connected.

## Core Features

- A feature only knows the interface of the Resources it uses. Agent Orchestration stores arguments through the `Objections` Resource and never sees how Objections Management stores them.
- The feature that provides a Resource can change where its data lives. Today every Resource works on the shared PostgreSQL database. A deployment could host a feature somewhere else or keep its data in another database, and the features that use it would not change.
- If a feature needs a Resource that nobody provides, the backend does not compile and does not start.

## Architecture

### Overview

#### Why Resources exist

Today all features share one PostgreSQL database. A feature can therefore join core tables, and one database transaction can cover a change in one feature together with the changes it makes through other features' Resources.

The shared database is a choice of this deployment, not a requirement. Another deployment may want to keep the data of one feature in MySQL, Redis, or MongoDB, or to get it from a central service over HTTP. The Resource is the place where such a change happens. The features that use `Objections` or `Projects` keep calling it the same way. Only the code that provides the Resource changes, and that code translates the calls for the other data store. [Moving a Resource to another data store](#moving-a-resource-to-another-data-store) describes the steps.

#### Needs and provides

Each feature declares in its manifest, the file `src/manifest.ts`, which Resources it needs and which it provides. FPP needs core's projects, its configuration, the download starter from Agent Orchestration, and its own file Resource:

```ts
export const feature = defineFeature({
	id: "fpp",
	needs: {
		projects: Projects,
		configuration: FppConfiguration,
		fppDownloads: FppDownloads,
		fppFiles: FppFiles,
	},
	providers: [fppFilesProvider],
	tables: fppSchema,
})
```

A feature lists its own Resources among its needs too, because its routes ask for them by name like any other Resource. A route that sets `fppFiles: true` gets the file service. A route cannot ask for anything the feature did not declare.

Configuration is a Resource as well. FPP declares that it needs `FppConfiguration`, and the application reads the environment and provides the value. A feature never reads another feature's settings.

The backend combines all manifests with `composeFeatures`. If a need has no provider, or two features provide the same Resource, the TypeScript compiler already reports an error. Startup checks the same again and also refuses Resources that depend on each other in a circle. A new feature therefore cannot start until everything it needs exists.

#### Where a Resource is defined

A Resource is usually defined in the package of the feature that provides it, such as `Projects` in core. Sometimes the providing package already imports the package that uses the Resource. Then the using package defines the Resource, and the other package provides it. FPP defines `FppDownloads`, the Resource for starting downloads, and Agent Orchestration provides it, because the Agent Orchestration package already imports FPP.


#### Getting data from another feature

When a feature needs data or an action that belongs to another feature:

1. Use a Resource that already offers it. Each feature's README lists the Resources it provides. Add the Resource to the `needs` of your manifest, and ask for it by name in the route that uses it.
2. If no Resource offers it, the owning feature adds a method to one of its Resources, or defines a new Resource. Name the method after the task, such as `getNormDeconstructions`, not after a table. Each method returns one fixed type, and callers cannot choose fields. A caller that needs a different result gets its own method.

Link tables, history tables, the change history, locks, and migration state are never offered as Resources. They stay inside the feature that owns them.

The providing feature can build such methods on a table Resource from [`providePostgresTable`](../postgres/README.md#streaming-and-table-resources), which saves writing plain queries by hand. Examination keeps its cache of norm breakdowns in a table Resource that only Examination uses. Agent Orchestration reads the cache through a method of `ExaminationVersioning` (shortened):

```ts
const NormDeconstructions = defineResource<NormDeconstructionTableService>()(
	"examination/NormDeconstructions",
)

export const examinationVersioningProvider = provide({
	resource: ExaminationVersioning,
	needs: { normDeconstructions: NormDeconstructions, nodes: ExaminationNodes },
	make: ({ normDeconstructions, nodes }) => ({
		getNormDeconstructions: (jurabk, paragraph) =>
			normDeconstructions.findMany({
				where: {
					kind: "and",
					filters: [
						{ kind: "eq", field: "jurabk", value: jurabk },
						{ kind: "eq", field: "paragraph", value: paragraph },
					],
				},
			}),
		// ...
	}),
})
```

#### Moving a Resource to another data store

SPARK Workflow runs as one backend with one PostgreSQL database. This section is for teams that want to keep the data of one feature somewhere else, for example in another database or in a central service.

To move a Resource, replace its provider. The features that use the Resource do not change.

1. Write a new provider for the same Resource. It implements every method of the Resource against the API of the new store. Resources have no generic remote protocol, so you write this translation yourself.
2. Read the connection settings from a configuration Resource in the provider's `needs`. Close the connections in the provider's `release` function.
3. In the feature's manifest, list the new provider instead of the PostgreSQL provider. The compiler and the startup check test it like any other provider.

After the move, `transact` no longer covers the moved data. Inside one PostgreSQL database, `transact` saves a change completely or not at all, including the calls to other features' Resources. See [query scopes and transactions](../postgres/README.md#query-and-transact). The new provider is not part of that transaction. If a later step fails, PostgreSQL undoes its changes, but the change in the new store remains.

Every transaction in the backend runs through one function: `transact` in [`packages/postgres/src/runtime.ts`](../postgres/src/runtime.ts). Every route, worker, and feature calls it through the `PostgreSQL` Resource. To cover the new store, extend this function, for example with a distributed lock, a two-phase commit, or a saga that undoes the finished steps when a later step fails. The features do not change.

A later release will let you set this up when you configure the backend, or run it through Temporal.

### Components

| Export | Purpose |
| --- | --- |
| `defineResource<Service>()(id)` | Defines a Resource with its name and its TypeScript interface |
| `provide`, `provideValue` | Declare how a Resource is built, or provide a fixed value such as configuration |
| `defineFeature` | Declares a feature's needs, providers, and tables |
| `composeFeatures` | Combines the features and refuses missing or duplicate Resources |
| `makeEffectResourceRuntime` (from `/effect`) | Builds the providers on startup and releases them on shutdown |

The main export does not depend on a database, an HTTP framework, or the Effect library, so a Resource can stand for any kind of data source.

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the workspace through the [root setup guide](../../README.md#getting-started).

### Environment Variables

The package reads no environment variables. Features declare the configuration they need, and the application provides it.

### Running the Module / Service

The library runs inside the SPARK Workflow backend. Start it as described in the [backend README](../../02-backend/apps/spark-backend/README.md#running-the-module--service).

## Testing

From this directory:

```sh
pnpm test
pnpm typecheck
```
