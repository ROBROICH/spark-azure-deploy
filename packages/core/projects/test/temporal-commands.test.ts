import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import {
  SPARK_TEMPORAL_FIXTURE_FILE,
  TemporalFixtureMatchError,
} from "@spark-temporal/typescript/caller";

import { ProjectTemporalCommandsService } from "../src/temporal/commands.ts";

const fixturePath = resolve(import.meta.dir, "../fixtures/temporal-runtime-outcomes.json");
const commands = () =>
  new ProjectTemporalCommandsService({
    temporalHost: "fixture.invalid:7233",
    temporalNamespace: "fixture",
  });

beforeEach(() => {
  process.env[SPARK_TEMPORAL_FIXTURE_FILE] = fixturePath;
});

afterEach(() => {
  delete process.env[SPARK_TEMPORAL_FIXTURE_FILE];
});

describe("Project Logic Temporal commands", () => {
  test("returns initialization and deletion fixtures without connecting to Temporal", async () => {
    expect(
      await commands().initializeProject({
        projectId: "1d3e4d64-c48b-45a4-a193-8d14e74dae01",
        projectTypeId: "00000000-0000-0000-0000-000000000000",
        projectVersion: 1,
      }),
    ).toEqual({ disposition: "started", workflowStatus: "RUNNING" });

    expect(
      await commands().deleteProject({
        projectId: "1d3e4d64-c48b-45a4-a193-8d14e74dae01",
        projectVersion: 1,
        workflowActor: {
          actorUserId: "71000000-0000-4000-8000-000000000001",
          triggeredByUserId: "71000000-0000-4000-8000-000000000002",
          workflowType: "ProjectLogicMutationTest",
        },
      }),
    ).toEqual({ started: true });
  });

  test("fails closed when a schema-valid input has no exact fixture", async () => {
    let failure: unknown;
    try {
      await commands().initializeProject({
        projectId: "10000000-0000-4000-8000-000000000099",
        projectTypeId: "00000000-0000-0000-0000-000000000000",
        projectVersion: 1,
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TemporalFixtureMatchError);
  });
});
