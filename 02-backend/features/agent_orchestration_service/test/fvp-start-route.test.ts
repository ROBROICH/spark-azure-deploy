import { Projects } from "@spark-workflow/core/projects/resource";
import { WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { createFeatureHttp, createHttpHost } from "@spark-workflow/http-host";
import {
  PostgreSQL,
  type PostgreSQLService,
  type PostgresSchema,
  type PostgresScope,
} from "@spark-workflow/postgres-runtime";
import type { AnyResource, ResourceRuntime, ResourceValue } from "@spark-workflow/resource";
import { Result } from "better-result";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const PROJECT_VERSION = 3;
const RESTART_PROJECT = "81000000-0000-4000-8000-000000000001";
const CONFLICT_PROJECT = "82000000-0000-4000-8000-000000000002";

process.env.SERVICE_NAME = "agent-orchestration-fvp-start-test";
process.env.AUTH_MODE = "disabled";
process.env.SPARK_TEMPORAL_FIXTURE_FILE = resolve(
  import.meta.dir,
  "../fixtures/fvp-start-outcomes.json",
);
process.env.TEMPORAL_HOST = "localhost:7233";
process.env.TEMPORAL_NAMESPACE = "default";

const { AosTemporalCommands, createRoutes, feature, parseAosCommandConfiguration } = await import(
  "../src/index.ts"
);
const { AosTemporalCommandsService } = await import("../src/temporal/commands.ts");

/** Fails any call the FVP start route must not make, and serves the declared overrides. */
const unavailable = <Service extends object>(
  name: string,
  overrides: Partial<Service> = {},
): Service =>
  new Proxy({} as Service, {
    get: (_target, property) => {
      // The runtime awaits every resolved resource, so a stub must not look thenable.
      if (property === "then") return undefined;
      if (Object.hasOwn(overrides, property)) return Reflect.get(overrides, property);
      return () => {
        throw new Error(`${name}.${String(property)} is not available in this test`);
      };
    },
  });

/** The controller resolves PostgreSQL on every request even though this route never queries. */
const unavailableScope = <Schema extends PostgresSchema>(): PostgresScope<Schema> => ({
  query: async () => {
    throw new Error("postgres is not available in this test");
  },
  streamRows: async function* () {
    yield* [];
  },
  transact: async (callback) => callback(),
});

const statusUpdates: string[] = [];
const temporal = new AosTemporalCommandsService(parseAosCommandConfiguration(process.env));

/** Reaches the fixture catalog, except for the project whose run Temporal already owns. */
const commands = unavailable<ResourceValue<typeof AosTemporalCommands>>("commands", {
  startFvp: async (input) => {
    if (input.projectId === CONFLICT_PROJECT) {
      throw new WorkflowExecutionAlreadyStartedError(
        "Workflow execution already started",
        input.executionId,
        input.workflowName,
      );
    }
    return temporal.startFvp(input);
  },
});

const available = new Map<AnyResource, unknown>([
  [PostgreSQL, { scope: unavailableScope } satisfies PostgreSQLService],
  [AosTemporalCommands, commands],
  [
    Projects,
    unavailable<ResourceValue<typeof Projects>>("projects", {
      resolveLatestVersion: async () => Result.ok(PROJECT_VERSION),
      updateStatus: async (projectId) => {
        statusUpdates.push(projectId);
        return Result.ok(undefined);
      },
    }),
  ],
]);

type Available = typeof PostgreSQL | (typeof feature.needs)[keyof typeof feature.needs];

const resources: ResourceRuntime<Available> = {
  get: async <Value extends Available>(resource: Value) => {
    const service = available.get(resource);
    if (service === undefined) throw new Error(`${resource.id} is not available in this test`);
    return service as ResourceValue<Value>;
  },
  ready: async () => undefined,
  close: () => temporal.close(),
};

const app = createHttpHost("agent-orchestration-fvp-start-test").use(
  createRoutes(createFeatureHttp(resources).for(feature)),
);

afterAll(() => resources.close());

const postStart = (projectId: string) =>
  app.handle(
    new Request("http://agent-orchestration.test/workflows/formale-pruefung", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    }),
  );

describe("FVP workflow start", () => {
  beforeEach(() => {
    statusUpdates.length = 0;
  });

  test("starts a new run for a project version whose previous run failed", async () => {
    const response = await postStart(RESTART_PROJECT);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      parentJobId: `FVPWorkflow-${RESTART_PROJECT}-v${PROJECT_VERSION}`,
    });
    expect(statusUpdates).toEqual([RESTART_PROJECT]);
  });

  test("answers 409 for an execution Temporal already owns, leaving the project status alone", async () => {
    const response = await postStart(CONFLICT_PROJECT);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ detail: "Workflow execution already started" });
    expect(statusUpdates).toEqual([]);
  });
});
