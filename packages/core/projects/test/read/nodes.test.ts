import { describe, expect } from "bun:test";

import {
  BatchNodesResponseSchema,
  NodeListSchema,
  parseErrorContract,
  type NodeType,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const batch = (
  projectId: string,
  nodes: Array<{ nodeType: NodeType; id: string }>,
  version?: number,
) =>
  readJson(
    `/${projectId}/batch-nodes${version === undefined ? "" : `?projectVersion=${version}`}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodes }),
    },
  );

describe("Project Logic node reads", () => {
  externalTest("returns every active node family from the retained project", async () => {
    const response = await readJson(
      `/${readScenarios.projects.populated.id}/nodes?projectVersion=1`,
    );
    const body = parseReadContract(NodeListSchema, response.body);
    const nodeTypes = new Set<NodeType>();
    const nodeIds = new Set<string>();
    for (const node of body.nodes) {
      nodeTypes.add(node.nodeType);
      nodeIds.add(node.id);
    }

    expect(response.status).toBe(200);
    expect(body.nodes).toHaveLength(1_024);
    expect(nodeTypes).toEqual(new Set(["subtopic", "topic", "topic_norm"]));
    expect(nodeIds.has(readScenarios.topics.withNorms)).toBeTrue();
    expect(nodeIds.has(readScenarios.subtopics.current)).toBeTrue();
    expect(nodeIds.has(readScenarios.topicNorms.current)).toBeTrue();
  });

  externalTest("resolves the local latest version and handles missing projects or versions", async () => {
    const [implicit, absentProject, absentVersion] = await Promise.all([
      readJson(`/${readScenarios.projects.populated.id}/nodes`),
      readJson(`/${readScenarios.projects.unknown.id}/nodes`),
      readJson(`/${readScenarios.projects.populated.id}/nodes?projectVersion=99`),
    ]);

    expect(implicit.status).toBe(200);
    expect(parseReadContract(NodeListSchema, implicit.body).nodes).toHaveLength(1_024);
    expect(absentProject.status).toBe(404);
    parseErrorContract(absentProject.body);
    expect(absentVersion.status).toBe(200);
    expect(parseReadContract(NodeListSchema, absentVersion.body)).toEqual({ nodes: [] });
  });

  externalTest("returns selected mixed nodes and omits duplicates or unknown IDs", async () => {
    const response = await batch(
      readScenarios.projects.populated.id,
      [
        { nodeType: "topic_norm", id: readScenarios.topicNorms.current },
        { nodeType: "topic", id: readScenarios.topics.withNorms },
        { nodeType: "subtopic", id: readScenarios.subtopics.current },
        { nodeType: "topic", id: readScenarios.topics.unknown },
        { nodeType: "topic", id: readScenarios.topics.withNorms },
      ],
      1,
    );
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(3);
    expect(new Set(body.results.map(({ id }) => id))).toEqual(
      new Set([
        readScenarios.topics.withNorms,
        readScenarios.subtopics.current,
        readScenarios.topicNorms.current,
      ]),
    );
  });

  externalTest("accepts an empty batch", async () => {
    const response = await batch(readScenarios.projects.populated.id, [], 1);
    expect(response.status).toBe(200);
    expect(parseReadContract(BatchNodesResponseSchema, response.body)).toEqual({ results: [] });
  });
});
