import { describe, expect } from "bun:test";

import {
  parseErrorContract,
  parseReadContract,
  TopicNormsSchema,
  TopicSchema,
  TopicsSchema,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const batch = (ids: string[], query = "") =>
  readJson(`/topics/batch${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ids),
  });

describe("Project Logic topic reads", () => {
  externalTest("lists the retained project topics and filters unknown projects", async () => {
    const [all, project, unknown] = await Promise.all([
      readJson("/topics?pageSize=200"),
      readJson(`/topics?projectId=${readScenarios.projects.populated.id}&pageSize=200`),
      readJson(`/topics?projectId=${readScenarios.projects.unknown.id}&pageSize=200`),
    ]);
    const allBody = parseReadContract(TopicsSchema, all.body);
    const projectBody = parseReadContract(TopicsSchema, project.body);

    expect([all.status, project.status, unknown.status]).toEqual([200, 200, 200]);
    expect(allBody).toHaveLength(51);
    expect(projectBody).toEqual(allBody);
    expect(parseReadContract(TopicsSchema, unknown.body)).toEqual([]);
    expect(new Set(allBody.map(({ projectId }) => projectId))).toEqual(
      new Set([readScenarios.projects.populated.id]),
    );
  });

  externalTest("accepts the projectVersion query AOS attaches from Temporal context", async () => {
    const response = await readJson(
      `/topics?projectId=${readScenarios.projects.populated.id}&pageSize=200&includeDeleted=false&projectVersion=1`,
    );
    expect(response.status).toBe(200);
    expect(parseReadContract(TopicsSchema, response.body).length).toBeGreaterThan(0);
  });

  externalTest("enforces topic pagination bounds", async () => {
    const [first, middle, empty, tooSmall, tooLarge] = await Promise.all([
      readJson("/topics?page=1&pageSize=1"),
      readJson("/topics?page=2&pageSize=1"),
      readJson("/topics?page=99&pageSize=1"),
      readJson("/topics?page=0&pageSize=1"),
      readJson("/topics?page=1&pageSize=201"),
    ]);

    expect(parseReadContract(TopicsSchema, first.body)).toHaveLength(1);
    expect(parseReadContract(TopicsSchema, middle.body)).toHaveLength(1);
    expect(parseReadContract(TopicsSchema, empty.body)).toEqual([]);
    expect([first.status, middle.status, empty.status, tooSmall.status, tooLarge.status]).toEqual([
      200, 200, 200, 422, 422,
    ]);
    parseErrorContract(tooSmall.body);
    parseErrorContract(tooLarge.body);
  });

  externalTest("returns one topic and rejects an unknown topic", async () => {
    const [found, absent] = await Promise.all([
      readJson(`/topics/${readScenarios.topics.withNorms}`),
      readJson(`/topics/${readScenarios.topics.unknown}`),
    ]);

    expect(found.status).toBe(200);
    expect(parseReadContract(TopicSchema, found.body)).toMatchObject({
      id: readScenarios.topics.withNorms,
      projectId: readScenarios.projects.populated.id,
    });
    expect(absent.status).toBe(404);
    parseErrorContract(absent.body);
  });

  externalTest("preserves batch order, deduplicates, and handles missing IDs", async () => {
    const [ordered, empty, mixed, raised] = await Promise.all([
      batch([
        readScenarios.topics.batchSecond,
        readScenarios.topics.withNorms,
        readScenarios.topics.batchSecond,
      ]),
      batch([]),
      batch([readScenarios.topics.withNorms, readScenarios.topics.unknown]),
      batch(
        [readScenarios.topics.withNorms, readScenarios.topics.unknown],
        "?raiseOnMissing=true",
      ),
    ]);

    expect(parseReadContract(TopicsSchema, ordered.body).map(({ id }) => id)).toEqual([
      readScenarios.topics.batchSecond,
      readScenarios.topics.withNorms,
    ]);
    expect(parseReadContract(TopicsSchema, empty.body)).toEqual([]);
    expect(parseReadContract(TopicsSchema, mixed.body).map(({ id }) => id)).toEqual([
      readScenarios.topics.withNorms,
    ]);
    expect([ordered.status, empty.status, mixed.status, raised.status]).toEqual([
      200, 200, 200, 404,
    ]);
    parseErrorContract(raised.body);
  });

  externalTest("returns populated, empty, and absent topic norm sets", async () => {
    const [populated, empty, absent] = await Promise.all([
      readJson(`/topics/${readScenarios.topics.withNorms}/norms`),
      readJson(`/topics/${readScenarios.topics.withoutNorms}/norms`),
      readJson(`/topics/${readScenarios.topics.unknown}/norms`),
    ]);

    expect(populated.status).toBe(200);
    expect(parseReadContract(TopicNormsSchema, populated.body)).toHaveLength(32);
    expect(empty.status).toBe(200);
    expect(parseReadContract(TopicNormsSchema, empty.body)).toEqual([]);
    expect(absent.status).toBe(404);
    parseErrorContract(absent.body);
  });
});
