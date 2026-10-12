import { createFeatureHttp, createHttpHost } from "@spark-workflow/http-host";
import {
  PostgreSQL,
  type PostgreSQLService,
  type PostgresSchema,
  type PostgresScope,
} from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provide } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import { afterAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";


const fixturePath = resolve(import.meta.dir, "../fixtures/temporal-outcomes.json");

process.env.SERVICE_NAME = "temporal-job-service-test";
process.env.AUTH_MODE = "disabled";
process.env.SPARK_TEMPORAL_FIXTURE_FILE = fixturePath;
process.env.MAX_SYSTEM_COMPLEXITY = "1000";
process.env.WORKFLOW_COMPLEXITY = JSON.stringify({
  BatchMVPWorkflow: 20,
  FVPWorkflow: 100,
});
process.env.DEFAULT_WORKFLOW_COMPLEXITY_WEIGHT = "3";
process.env.TEMPORAL_HOST = "localhost:7233";
process.env.TEMPORAL_NAMESPACE = "default";
process.env.TEMPORAL_MAX_CONCURRENT_ACTIVITIES = "2";
process.env.ARCHIVAL_ENABLED = "false";
process.env.ARCHIVAL_WORKFLOW_ID = "weekly-history";
process.env.ARCHIVAL_CRON = "0 0 * * 0";
process.env.ARCHIVAL_BATCH_SIZE = "100";
process.env.ARCHIVAL_S3_PREFIX = "temporal-history";

const { createRoutes, feature, parseTemporalQueryConfiguration, TemporalQueryConfiguration } =
  await import("../src/index.ts");
const unavailableScope = <Schema extends PostgresSchema>(): PostgresScope<Schema> => ({
  query: async () => {
    throw new Error("The query fixture does not provide PostgreSQL");
  },
  streamRows: async function* () {
    yield* [];
  },
  transact: async (callback) => callback(),
});
const postgres: PostgreSQLService = {
  scope: unavailableScope,
};
const testPlatform = defineFeature({
  id: "temporal-job-query-test-platform",
  needs: {},
  providers: [
    provide({ resource: PostgreSQL, needs: {}, make: () => postgres }),
    provide({
      resource: TemporalQueryConfiguration,
      needs: {},
      make: () => parseTemporalQueryConfiguration(process.env),
    }),
  ] as const,
  tables: {},
});
const resources = makeEffectResourceRuntime(composeFeatures([feature, testPlatform] as const));
await resources.ready();
const app = createHttpHost("temporal-job-service-test").use(
  createRoutes(createFeatureHttp(resources).for(feature)),
);

afterAll(() => resources.close());


describe("Temporal Job TypeScript query API", () => {
  test("exposes declared failures and an absent exact fixture without loading live Temporal", async () => {
    for (const [path, status, body] of [
      [
        "/temporal/workflows/tjs-missing-workflow",
        404,
        { detail: "Workflow does not exist: tjs-missing-workflow" },
      ],
      [
        "/temporal/workflows/tjs-rpc-failure",
        500,
        { detail: "An error occurred during workflow retrieval" },
      ],
      [
        "/temporal/workflows?projectId=81000000-0000-4000-8000-000000000099",
        500,
        { detail: "An error occurred during workflow retrieval" },
      ],
    ] as const) {
      const response = await app.handle(new Request(`http://temporal-job.test${path}`));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual(body);
    }
  });

  test("rejects invalid query inputs", async () => {
    const list = await app.handle(
      new Request(
        "http://temporal-job.test/temporal/workflows?projectId=81000000-0000-4000-8000-000000000001&executionStatus=NotAStatus&projectVersion=0",
      ),
    );
    expect(list.status).toBe(422);

    const byType = await app.handle(
      new Request(
        "http://temporal-job.test/temporal/workflows/by-type/82000000-0000-4000-8000-000000000001?workflowType=Bad%22Type",
      ),
    );
    expect(byType.status).toBe(422);
  });
});

describe("by-type workflowIds filter", () => {
  const byTypePath = "/temporal/workflows/by-type/82000000-0000-4000-8000-000000000002?workflowType=BatchMVPWorkflow";
  const readByType = (query: string) => app.handle(new Request(`http://temporal-job.test${byTypePath}&${query}`));
  const workflowIdsQuery = (count: number) =>
    Array.from({ length: count }, (_, index) => `workflowIds=norm-${index}`).join("&");

  test("returns the page for the requested workflow ids", async () => {
    const response = await readByType("workflowIds=by-type-older&workflowIds=by-type-missing");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.workflows.map((workflow: { workflowId: string }) => workflow.workflowId)).toEqual(["by-type-older"]);
  });

  test("accepts a single workflow id", async () => {
    const response = await readByType("workflowIds=by-type-newer");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.workflows.map((workflow: { workflowId: string }) => workflow.workflowId)).toEqual(["by-type-newer"]);
  });

  test("accepts 100 workflow ids", async () => {
    const response = await readByType(workflowIdsQuery(100));

    expect(response.status).toBe(200);
    expect((await response.json()).workflows).toEqual([]);
  });

  test("rejects an empty, oversized, or comma-expanded workflow id list", async () => {
    const commaExpanded = Array.from({ length: 51 }, (_, index) => `workflowIds=a${index},b${index}`).join("&");
    for (const query of ["workflowIds=", workflowIdsQuery(101), commaExpanded]) {
      expect((await readByType(query)).status).toBe(422);
    }
  });

  test("rejects workflowIds combined with workflowId or a root continuation", async () => {
    for (const query of [
      "workflowIds=by-type-older&workflowId=by-type-newer",
      "workflowIds=by-type-older&rootWorkflowId=by-type-newer&rootRunId=82000000-0000-4000-8000-000000000009",
      "workflowIds=by-type-older&rootRunId=82000000-0000-4000-8000-000000000009",
    ]) {
      const response = await readByType(query);
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ detail: "Invalid workflow filter" });
    }
  });
});
