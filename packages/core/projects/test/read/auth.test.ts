import { describe, expect } from "bun:test";

import {
  DeadlinesSchema,
  parseErrorContract,
  parseReadContract,
  ProjectSchema,
  ProjectsSchema,
  TopicSchema,
  TopicsSchema,
} from "../support/read-contracts.ts";
import {
  bearer,
  readJson,
  requiredStrictSubject,
  requiredStrictToken,
  strictExternalTest,
} from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const strictRead = (path: string, token?: string) =>
  readJson(
    path,
    token === undefined ? undefined : { headers: bearer(token) },
    "PLS_STRICT_BASE_URL",
  );

const strictBatch = (ids: string[], token: string) =>
  readJson(
    "/topics/batch",
    {
      method: "POST",
      headers: { ...bearer(token), "content-type": "application/json" },
      body: JSON.stringify(ids),
    },
    "PLS_STRICT_BASE_URL",
  );

describe("Project Logic strict shared-auth boundary", () => {
  strictExternalTest("rejects missing and invalid bearer tokens", async () => {
    const [missing, invalid] = await Promise.all([
      strictRead("/project-types"),
      strictRead("/project-types", "not-a-jwt"),
    ]);

    expect([missing.status, invalid.status]).toEqual([401, 401]);
    parseErrorContract(missing.body);
    parseErrorContract(invalid.body);
  });

  strictExternalTest("applies provider project membership to list routes", async () => {
    const token = requiredStrictToken("PLS_VIEWER_TOKEN");
    const [topics, deadlines, projects] = await Promise.all([
      strictRead("/topics?pageSize=200", token),
      strictRead("/deadlines", token),
      strictRead("/projects", token),
    ]);
    const topicBody = parseReadContract(TopicsSchema, topics.body);
    const deadlineBody = parseReadContract(DeadlinesSchema, deadlines.body);
    const projectBody = parseReadContract(ProjectsSchema, projects.body);

    expect([topics.status, deadlines.status, projects.status]).toEqual([200, 200, 200]);
    expect(topicBody).toHaveLength(51);
    expect(new Set(topicBody.map(({ projectId }) => projectId))).toEqual(
      new Set([readScenarios.projects.populated.id]),
    );
    expect(deadlineBody).toEqual([]);
    expect(projectBody).toHaveLength(1);
    expect(projectBody[0]?.id).toBe(readScenarios.projects.populated.id);
    expect(projectBody[0]?.owners).toContain(requiredStrictSubject("PLS_VIEWER_SUBJECT"));
  });

  strictExternalTest("returns empty lists without a matching relationship", async () => {
    const token = requiredStrictToken("PLS_FORBIDDEN_TOKEN");
    const [topics, deadlines, projects] = await Promise.all([
      strictRead("/topics?pageSize=200", token),
      strictRead("/deadlines", token),
      strictRead("/projects", token),
    ]);

    expect(parseReadContract(TopicsSchema, topics.body)).toEqual([]);
    expect(parseReadContract(DeadlinesSchema, deadlines.body)).toEqual([]);
    expect(parseReadContract(ProjectsSchema, projects.body)).toEqual([]);
    expect([topics.status, deadlines.status, projects.status]).toEqual([200, 200, 200]);
  });

  strictExternalTest("preserves role bypass for list, dynamic, and bulk routes", async () => {
    const token = requiredStrictToken("PLS_USER_TOKEN");
    const [listed, one, batched, project] = await Promise.all([
      strictRead("/topics?pageSize=200", token),
      strictRead(`/topics/${readScenarios.topics.withNorms}`, token),
      strictBatch([readScenarios.topics.batchSecond, readScenarios.topics.withNorms], token),
      strictRead(`/projects/${readScenarios.projects.populated.id}`, token),
    ]);
    const listedBody = parseReadContract(TopicsSchema, listed.body);
    const oneBody = parseReadContract(TopicSchema, one.body);
    const batchBody = parseReadContract(TopicsSchema, batched.body);
    const projectBody = parseReadContract(ProjectSchema, project.body);

    expect([listed.status, one.status, batched.status, project.status]).toEqual([200, 200, 200, 200]);
    expect(listedBody).toHaveLength(51);
    expect(oneBody.id).toBe(readScenarios.topics.withNorms);
    expect(batchBody.map(({ id }) => id)).toEqual([
      readScenarios.topics.batchSecond,
      readScenarios.topics.withNorms,
    ]);
    expect(projectBody.members).toContain(requiredStrictSubject("PLS_USER_SUBJECT"));
    expect(projectBody.auditors).toContain(requiredStrictSubject("PLS_USER_SUBJECT"));
  });

  strictExternalTest("rejects a viewer on a role-protected dynamic route", async () => {
    const response = await strictRead(
      `/topics/${readScenarios.topics.withNorms}`,
      requiredStrictToken("PLS_VIEWER_TOKEN"),
    );

    expect(response.status).toBe(403);
    parseErrorContract(response.body);
  });
});
