import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  PROJECT_INITIALIZATION_TEMPORAL_OPERATION,
  PROJECT_INITIALIZATION_TASK_QUEUE,
  PROJECT_INITIALIZATION_WORKFLOW,
  ProjectInitializationTemporalError,
  ProjectInitializationTemporalInput,
  ProjectInitializationTemporalResult,
  type Static,
} from "@spark-temporal/contracts";

import {
  SPARK_TEMPORAL_FIXTURE_FILE,
  TemporalFixtureDeclaredError,
  TemporalFixtureMatchError,
  readTemporalFixture,
} from "@spark-temporal/typescript/caller";

const OPERATION = PROJECT_INITIALIZATION_TEMPORAL_OPERATION;
type FixtureInput = Static<typeof ProjectInitializationTemporalInput>;
type FixtureResult = Static<typeof ProjectInitializationTemporalResult>;
type FixtureError = Static<typeof ProjectInitializationTemporalError>;
interface FixtureDocument {
  name: string;
  operation: string;
  input: Omit<FixtureInput, "projectVersion"> & { projectVersion: number | string };
  outcome: {
    kind: string;
    value?: Omit<FixtureResult, "workflowStatus"> & { workflowStatus: string };
    error?: FixtureError;
  };
}
const input: FixtureInput = {
  workflowName: PROJECT_INITIALIZATION_WORKFLOW,
  executionId: "ProjectInitializationWorkflow-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-v1",
  taskQueue: PROJECT_INITIALIZATION_TASK_QUEUE,
  projectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  projectTypeId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  projectVersion: 1,
  idReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
  idConflictPolicy: "FAIL",
};
const corpus = {
  fixtures: [
    {
      name: "started",
      operation: OPERATION,
      input,
      outcome: {
        kind: "return",
        value: { disposition: "started", workflowStatus: "RUNNING" },
      },
    },
    {
      name: "already started",
      operation: OPERATION,
      input: { ...input, projectVersion: 2 },
      outcome: {
        kind: "return",
        value: { disposition: "already_started", workflowStatus: "COMPLETED" },
      },
    },
    {
      name: "failed",
      operation: OPERATION,
      input: { ...input, projectVersion: 3 },
      outcome: {
        kind: "throw",
        error: { code: "TEMPORAL_OPERATION_FAILED", message: "failed" },
      },
    },
  ],
} satisfies { fixtures: FixtureDocument[] };

const contracts = {
  input: ProjectInitializationTemporalInput,
  result: ProjectInitializationTemporalResult,
  error: ProjectInitializationTemporalError,
};

let temporaryDirectories: string[] = [];

function fixtureInput(index: number): FixtureInput {
  return corpus.fixtures[index]!.input as FixtureInput;
}

function catalogWith(fixtures: readonly FixtureDocument[]): string {
  const directory = mkdtempSync(resolve(tmpdir(), "spark-temporal-ts-"));
  temporaryDirectories.push(directory);
  const path = resolve(directory, "fixtures.json");
  writeFileSync(path, JSON.stringify({ fixtures }));
  return path;
}

beforeEach(() => {
  delete process.env[SPARK_TEMPORAL_FIXTURE_FILE];
});

afterEach(() => {
  delete process.env[SPARK_TEMPORAL_FIXTURE_FILE];
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
  temporaryDirectories = [];
});

describe("readTemporalFixture", () => {
  test("returns undefined outside fixture mode", () => {
    expect(readTemporalFixture(OPERATION, fixtureInput(0), contracts)).toBeUndefined();
  });

  test("rejects an empty operation or configured path", () => {
    expect(() => readTemporalFixture("", fixtureInput(0), contracts)).toThrow("must not be empty");
    process.env[SPARK_TEMPORAL_FIXTURE_FILE] = "";
    expect(() => readTemporalFixture(OPERATION, fixtureInput(0), contracts)).toThrow(
      "must name a fixture catalog",
    );
  });

  test("fixture mode returns the one exact success", () => {
    process.env[SPARK_TEMPORAL_FIXTURE_FILE] = catalogWith(corpus.fixtures);
    const result = readTemporalFixture(OPERATION, fixtureInput(1), contracts);

    expect(result).toEqual({ disposition: "already_started", workflowStatus: "COMPLETED" });
  });

  test("fixture mode throws the declared typed error", () => {
    process.env[SPARK_TEMPORAL_FIXTURE_FILE] = catalogWith(corpus.fixtures);

    try {
      readTemporalFixture(OPERATION, fixtureInput(2), contracts);
      throw new Error("expected the fixture error");
    } catch (error) {
      if (!(error instanceof TemporalFixtureDeclaredError)) throw error;
      expect(error.code).toBe("TEMPORAL_OPERATION_FAILED");
    }
  });

  test("fixture mode distinguishes a missing operation from an input mismatch", () => {
    process.env[SPARK_TEMPORAL_FIXTURE_FILE] = catalogWith([corpus.fixtures[0]!]);
    expect(() => readTemporalFixture("unrecorded.operation", fixtureInput(0), contracts)).toThrow(
      "no fixtures for operation",
    );
    expect(() => readTemporalFixture(OPERATION, fixtureInput(1), contracts)).toThrow(
      "no exact input match",
    );
  });

  test("fixture mode rejects duplicate exact matches", () => {
    process.env[SPARK_TEMPORAL_FIXTURE_FILE] = catalogWith([
      corpus.fixtures[0]!,
      corpus.fixtures[0]!,
    ]);
    expect(() => readTemporalFixture(OPERATION, fixtureInput(0), contracts)).toThrow(
      TemporalFixtureMatchError,
    );
  });

  test("fixture mode treats a differently typed input as a mismatch", () => {
    const malformedInput: FixtureDocument = structuredClone(corpus.fixtures[0]!);
    malformedInput.input.projectVersion = "1";
    process.env[SPARK_TEMPORAL_FIXTURE_FILE] = catalogWith([malformedInput]);
    expect(() => readTemporalFixture(OPERATION, fixtureInput(0), contracts)).toThrow(
      "no exact input match",
    );
  });
});
