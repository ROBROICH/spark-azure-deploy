import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import type {
  DocumentManagementFileProcessingCancelTemporalInput,
  DocumentManagementFileProcessingTemporalInput,
  DocumentManagementProjectVersionApprovalTemporalInput,
} from "@spark-temporal/contracts";
import {
  SPARK_TEMPORAL_FIXTURE_FILE,
  TemporalFixtureMatchError,
} from "@spark-temporal/typescript/caller";

import { DocumentTemporalCommandsService } from "../src/temporal/commands.ts";

const fixturePath = resolve(import.meta.dir, "../fixtures/temporal-runtime-outcomes.json");
const catalog = (await Bun.file(fixturePath).json()) as {
  fixtures: Array<{ name: string; input: unknown }>;
};

function fixture<Input>(name: string): Input {
  const entry = catalog.fixtures.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`missing fixture '${name}'`);
  return structuredClone(entry.input) as Input;
}

const commands = new DocumentTemporalCommandsService({
  temporalHost: "unused.invalid:7233",
  temporalNamespace: "unused",
});

beforeEach(() => {
  process.env[SPARK_TEMPORAL_FIXTURE_FILE] = fixturePath;
});

afterEach(() => {
  delete process.env[SPARK_TEMPORAL_FIXTURE_FILE];
});

describe("DMS Temporal commands", () => {
  test("returns all three fixtures without connecting to Temporal", async () => {
    expect(
      await commands.startFileProcessing(
        fixture<DocumentManagementFileProcessingTemporalInput>("zip-processing-running"),
      ),
    ).toEqual({
      workflowId: "FileProcessingWorkflow-00000000-0000-4000-8000-000000000101",
      runId: "00000000-0000-4000-8000-000000000401",
      workflowStatus: "RUNNING",
    });
    expect(
      await commands.executeProjectVersionApproval(
        fixture<DocumentManagementProjectVersionApprovalTemporalInput>("approval-created-version"),
      ),
    ).toEqual({ newVersion: 10 });
    expect(
      await commands.cancelFileProcessing(
        fixture<DocumentManagementFileProcessingCancelTemporalInput>("cancel-processing"),
      ),
    ).toEqual({
      workflowId: "00000000-0000-4000-8000-000000000205",
      cancelled: true,
    });
  });

  test("fails closed when a valid command has no exact fixture", async () => {
    const input = fixture<DocumentManagementFileProcessingCancelTemporalInput>("cancel-processing");
    input.workflowId = "00000000-0000-4000-8000-000000000299";
    let failure: unknown;
    try {
      await commands.cancelFileProcessing(input);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TemporalFixtureMatchError);
  });
});
