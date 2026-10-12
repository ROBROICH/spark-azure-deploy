import { createFeatureHttp, createHttpHost } from "@spark-workflow/http-host";
import { PostgreSQL, type PostgreSQLService } from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provide } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import { machineHeaders, useStrictAuthentication } from "@spark-workflow/test-support/strict-auth";
import { afterAll, describe, expect, mock, test } from "bun:test";
import { resolve } from "node:path";

import rawCatalog from "../fixtures/temporal-outcomes.json";

const workflowProject = "81000000-0000-4000-8000-000000000004";
const typedProject = "82000000-0000-4000-8000-000000000001";
const memberSubject = "00000000-0000-0000-0000-00000000000a";
const strangerSubject = "00000000-0000-0000-0000-00000000000b";
const adminSubject = "00000000-0000-0000-0000-00000000000c";

const { stop, userToken } = await useStrictAuthentication([
  `${memberSubject} read project:${workflowProject}`,
  `${memberSubject} read project:${typedProject}`,
]);

Object.assign(process.env, {
  SERVICE_NAME: "temporal-job-service-test",
  SPARK_TEMPORAL_FIXTURE_FILE: resolve(import.meta.dir, "../fixtures/temporal-outcomes.json"),
  MAX_SYSTEM_COMPLEXITY: "1000",
  WORKFLOW_COMPLEXITY: "{}",
  DEFAULT_WORKFLOW_COMPLEXITY_WEIGHT: "3",
  TEMPORAL_HOST: "localhost:7233",
  TEMPORAL_NAMESPACE: "default",
});

const { createRoutes, feature, parseTemporalQueryConfiguration, TemporalQueryConfiguration } =
  await import("../src/index.ts");
const postgres: PostgreSQLService = {
  scope: () => ({
    query: async () => {
      throw new Error("Workflow reads do not use PostgreSQL");
    },
    streamRows: async function* () {
      yield* [];
    },
    transact: async (callback) => callback(),
  }),
};
const resources = makeEffectResourceRuntime(
  composeFeatures([
    feature,
    defineFeature({
      id: "temporal-job-read-authorization-platform",
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
    }),
  ] as const),
);
await resources.ready();
const app = createHttpHost("temporal-job-service-test").use(
  createRoutes(createFeatureHttp(resources).for(feature)),
);

afterAll(async () => {
  await resources.close();
  stop();
  mock.restore();
});

function fixtureValue(name: string): unknown {
  const fixture = rawCatalog.fixtures.find((candidate) => candidate.name === name);
  if (fixture?.outcome.kind !== "return") throw new Error(`missing return fixture '${name}'`);
  return fixture.outcome.value;
}

const denied = { detail: "Access denied" };
const projectWorkflows = `/temporal/workflows?projectId=${workflowProject}&executionStatus=Completed&projectVersion=4`;
const typedWorkflows = `/temporal/workflows/by-type/${typedProject}?workflowType=BatchMVPWorkflow`;

describe("workflow reads authorize through the workflow project", () => {
  for (const scenario of [
    {
      name: "denies an unrelated user the workflow detail",
      path: "/temporal/workflows/tjs-completed-workflow",
      headers: () => userToken(strangerSubject, ["user"]),
      status: 403,
      body: denied,
    },
    {
      name: "denies an unrelated user the execution tree",
      path: "/temporal/workflows/tjs-tree-nested/execution-tree",
      headers: () => userToken(strangerSubject, ["user"]),
      status: 403,
      body: denied,
    },
    {
      name: "denies an unrelated user the project workflow list",
      path: projectWorkflows,
      headers: () => userToken(strangerSubject, ["user"]),
      status: 403,
      body: denied,
    },
    {
      name: "denies an unrelated user the project workflows of one type",
      path: typedWorkflows,
      headers: () => userToken(strangerSubject, ["user"]),
      status: 403,
      body: denied,
    },
    {
      name: "admits a project member to the project workflows of one type",
      path: typedWorkflows,
      headers: () => userToken(memberSubject, ["user"]),
      status: 200,
      body: fixtureValue("by-type-empty"),
    },
    {
      name: "admits a project member to the project workflow list",
      path: projectWorkflows,
      headers: () => userToken(memberSubject, ["user"]),
      status: 200,
      body: fixtureValue("list-completed-current-version"),
    },
    {
      name: "admits a project member to the workflow detail",
      path: "/temporal/workflows/tjs-completed-workflow",
      headers: () => userToken(memberSubject, ["user"]),
      status: 200,
      body: fixtureValue("workflow-completed-result"),
    },
    {
      name: "admits a project member to the execution tree",
      path: "/temporal/workflows/tjs-tree-nested/execution-tree",
      headers: () => userToken(memberSubject, ["user"]),
      status: 200,
      body: fixtureValue("execution-tree-nested"),
    },
    {
      name: "denies a user a workflow without a project",
      path: "/temporal/workflows/tjs-running-workflow",
      headers: () => userToken(memberSubject, ["user"]),
      status: 403,
      body: denied,
    },
    {
      name: "lets admin read a workflow without a project",
      path: "/temporal/workflows/tjs-running-workflow",
      headers: () => userToken(adminSubject, ["admin"]),
      status: 200,
      body: fixtureValue("workflow-running"),
    },
    {
      name: "lets a service read a workflow without a project",
      path: "/temporal/workflows/tjs-running-workflow",
      headers: async () => machineHeaders,
      status: 200,
      body: fixtureValue("workflow-running"),
    },
  ]) {
    test(scenario.name, async () => {
      const response = await app.handle(
        new Request(`http://temporal-job.test${scenario.path}`, {
          headers: await scenario.headers(),
        }),
      );

      expect(response.status).toBe(scenario.status);
      expect(await response.json()).toEqual(scenario.body);
    });
  }
});
