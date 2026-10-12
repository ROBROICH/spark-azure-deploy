# Temporal contracts

The backend is written in TypeScript and the AI modules in Python. They talk through Temporal, the workflow engine. The backend starts a workflow on the queue of a module, and the module returns a result in an agreed format. `@spark-temporal/contracts` is the one place where these names and formats are defined. TypeScript code imports them directly. Python code gets Pydantic models generated from them.

## Core Features

- Each file in `src/contracts/` describes one connection between the backend and a module: the queue, the workflow name, the input, and the output. Examples are formal completeness (`formale-pruefung`), plausibility (`plausibilitaet-pruefung`), norm breakdown (`rechtsmethodik`), or risk hints (`risikohinweiser`).
- `pnpm generate` writes the Pydantic models and a list of workflow names and queues for the Python modules.
- Both sides use the same definitions. The TypeScript type check and the Pydantic validation therefore catch data that no longer matches the agreed format.

## Architecture

### Overview

A contract file looks like this. The risk finder reads one decision-draft chapter and returns risks:

```ts
export const RISIKOHINWEIS_TASK_QUEUE = "risikohinweiser" as const
export const RISIKOHINWEIS_WORKFLOW = "RiskCheckerWorkflow" as WorkflowName<"RiskCheckerWorkflow">

const contracts = Type.Module({
	GeneratedUUID,
	PFBChapter: Type.Object({ id: Type.Ref("GeneratedUUID"), title: Type.Optional(Type.Union([Type.String(), Type.Null()])), text: Type.String() }, { additionalProperties: false }),
	RiskFinding: Type.Object({
		riskId: Type.Ref("GeneratedUUID"),
		chapterId: Type.Ref("GeneratedUUID"),
		quote: Type.String(),
		description: Type.String(),
		implications: Type.String(),
		recommendation: Type.String(),
		severity: Type.Integer({ minimum: 1, maximum: 10 }),
	}, { additionalProperties: false }),
	RiskFinderOutput: Type.Object({ risks: Type.Array(Type.Ref("RiskFinding")) }, { additionalProperties: false }),
})
```

`src/registry.ts` holds the shared types, such as `GeneratedUUID` and the date-time format, and the `WorkflowName` type.

`pnpm generate` collects all schemas into one JSON Schema document in memory and passes it to `datamodel-code-generator`. It writes the Pydantic models to `packages/temporal/python/src/temporal/contracts.py` and the workflow names and task queues to `packages/temporal/python/src/temporal/registry.py`. Both Python files are committed. The JSON Schema and compiled JavaScript are not. UUID, string ID, and date-time fields map through their shared TypeBox definition, so the generator needs no per-field translation table.

### Change a contract

1. Edit the TypeBox file in `src/contracts/`.
2. Run `pnpm generate` from this directory.
3. Commit the TypeBox change together with the regenerated `contracts.py` and `registry.py`.
4. Update the TypeScript and Python code that uses the changed fields.

## Getting Started

### Prerequisites

Set up Bun, pnpm, and the uv environment through the [root setup guide](../../../README.md#getting-started). `pnpm generate` needs `datamodel-code-generator` from the uv environment.

### Environment Variables

The package and its generator read no environment variables.

### Running the Module / Service

No contract service runs. TypeScript code imports the schemas, and Python modules import the committed generated files.

## Testing

From this directory:

```sh
pnpm test
pnpm typecheck
```
