import { type Static, type TSchema, Value } from "@spark-temporal/contracts";
import { Type as T } from "@sinclair/typebox";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

export const SPARK_TEMPORAL_FIXTURE_FILE = "SPARK_TEMPORAL_FIXTURE_FILE" as const;

const FixtureJsonSchema = T.Recursive((Self) =>
  T.Union([
    T.Null(),
    T.Boolean(),
    T.Number(),
    T.String(),
    T.Array(Self),
    T.Record(T.String(), Self),
  ]),
);
const FixtureValueSchema = T.Record(T.String(), FixtureJsonSchema);
const FixtureCatalogSchema = T.Object(
  {
    fixtures: T.Array(
      T.Object(
        {
          name: T.String({ minLength: 1 }),
          operation: T.String({ minLength: 1 }),
          input: FixtureValueSchema,
          outcome: T.Union([
            T.Object(
              { kind: T.Literal("return"), value: FixtureValueSchema },
              { additionalProperties: false },
            ),
            T.Object(
              { kind: T.Literal("throw"), error: FixtureValueSchema },
              { additionalProperties: false },
            ),
          ]),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
type FixtureValue = Static<typeof FixtureValueSchema>;

export class TemporalFixtureValidationError extends Error {}

export class TemporalFixtureMatchError extends Error {}

export class TemporalFixtureDeclaredError extends Error {
  readonly code: string;
  readonly outcome: FixtureValue;

  constructor(operation: string, outcome: FixtureValue) {
    const code =
      outcome.code === undefined ? "TEMPORAL_FIXTURE_ERROR" : `${outcome.code}`;
    const message =
      outcome.message === undefined
        ? "Declared Temporal fixture error"
        : `${outcome.message}`;
    super(`${operation}: ${message}`);
    this.name = "TemporalFixtureDeclaredError";
    this.code = code;
    this.outcome = outcome;
  }
}

interface FixtureContracts<
  InputSchema extends TSchema,
  ResultSchema extends TSchema,
  ErrorSchema extends TSchema,
> {
  readonly input: InputSchema;
  readonly result: ResultSchema;
  readonly error: ErrorSchema;
}

export function readTemporalFixture<
  InputSchema extends TSchema,
  ResultSchema extends TSchema,
  ErrorSchema extends TSchema,
>(
  operation: string,
  input: Static<InputSchema>,
  contracts: FixtureContracts<InputSchema, ResultSchema, ErrorSchema>,
): Static<ResultSchema> | undefined {
  if (operation.length === 0) {
    throw new TemporalFixtureValidationError("Temporal operation name must not be empty");
  }
  const path = process.env[SPARK_TEMPORAL_FIXTURE_FILE];
  if (path === undefined) return undefined;
  if (path.length === 0) {
    throw new TemporalFixtureValidationError(
      `${SPARK_TEMPORAL_FIXTURE_FILE} must name a fixture catalog`,
    );
  }
  const absolutePath = resolve(path);
  let catalog: Static<typeof FixtureCatalogSchema>;
  try {
    catalog = Value.Parse(
      FixtureCatalogSchema,
      JSON.parse(readFileSync(absolutePath, "utf8")),
    );
  } catch (error) {
    throw new TemporalFixtureValidationError(
      `invalid Temporal fixture catalog '${absolutePath}': ${String(error)}`,
    );
  }
  const operationFixtures = catalog.fixtures.filter((fixture) => fixture.operation === operation);
  if (operationFixtures.length === 0) {
    throw new TemporalFixtureMatchError(`no fixtures for operation '${operation}'`);
  }

  const jsonInput = JSON.parse(JSON.stringify(input));
  const matches = operationFixtures.filter((fixture) =>
    isDeepStrictEqual(fixture.input, jsonInput),
  );
  if (matches.length === 0) {
    throw new TemporalFixtureMatchError(`operation '${operation}' has no exact input match`);
  }
  if (matches.length !== 1) {
    throw new TemporalFixtureMatchError(
      `operation '${operation}' has ${matches.length} exact matches; expected one`,
    );
  }

  const fixture = matches[0]!;
  if (fixture.outcome.kind === "return") {
    return Value.Parse(contracts.result, fixture.outcome.value);
  }
  throw new TemporalFixtureDeclaredError(operation, fixture.outcome.error);
}
