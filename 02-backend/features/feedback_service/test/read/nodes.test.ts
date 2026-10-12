import { describe, expect } from "bun:test";

import {
  BatchNodesResponseSchema,
  NodeListSchema,
  parseReadContract,
  stabilizeBatchResponseForSnapshot,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

interface NodeRef {
  nodeType: "feedback";
  id: string;
}

const batch = (projectId: string, nodes: NodeRef[], version?: number) =>
  readJson(
    `/${projectId}/batch-nodes${version === undefined ? "" : `?projectVersion=${version}`}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodes }),
    },
  );

describe("GET /{project_id}/nodes HTTP contract", () => {
  externalTest(
    "snapshots current Feedback summaries, type, parents, and deleted exclusion",
    async () => {
      const response = await readJson(
        `/${readScenarios.projects.populated.id}/nodes?projectVersion=1`,
      );
      const body = parseReadContract(NodeListSchema, response.body);

      expect(body.nodes.every((node) => node.nodeType === "feedback")).toBe(true);
      expect(body.nodes.every((node) => node.parents.length === 0)).toBe(true);
      expect(body.nodes.map((node) => node.id)).not.toContain(readScenarios.nodes.deleted);
      expect({ status: response.status, body }).toMatchSnapshot();
    },
  );

  externalTest("snapshots a retained Testing project at version two", async () => {
    const response = await readJson(
      `/${readScenarios.projects.versionTwo.id}/nodes?projectVersion=2`,
    );
    const body = parseReadContract(NodeListSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots an explicit empty project", async () => {
    const response = await readJson(`/${readScenarios.projects.empty.id}/nodes?projectVersion=2`);
    const body = parseReadContract(NodeListSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });
});

describe("POST /{project_id}/batch-nodes HTTP contract", () => {
  externalTest("snapshots an empty batch", async () => {
    const response = await batch(readScenarios.projects.populated.id, [], 1);
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect({
      status: response.status,
      body: stabilizeBatchResponseForSnapshot(body),
    }).toMatchSnapshot();
  });

  externalTest(
    "freezes complete payloads and incumbent ordering for known, unknown, and deleted IDs",
    async () => {
      const refs: NodeRef[] = [
        { nodeType: "feedback", id: readScenarios.nodes.currentSecondary },
        { nodeType: "feedback", id: readScenarios.nodes.unknown },
        { nodeType: "feedback", id: readScenarios.nodes.currentPrimary },
        { nodeType: "feedback", id: readScenarios.nodes.deleted },
      ];
      const response = await batch(readScenarios.projects.populated.id, refs, 1);
      const body = parseReadContract(BatchNodesResponseSchema, response.body);

      expect(body.results).toHaveLength(2);
      expect(body.results.every((node) => node.nodeType === "feedback")).toBe(true);
      expect(body.results.map((node) => node.id)).not.toContain(readScenarios.nodes.unknown);
      expect(body.results.map((node) => node.id)).not.toContain(readScenarios.nodes.deleted);
      expect({
        requestedIds: refs.map((node) => node.id),
        status: response.status,
        body: stabilizeBatchResponseForSnapshot(body),
      }).toMatchSnapshot();
    },
  );

  externalTest("snapshots an unknown-only batch", async () => {
    const response = await batch(
      readScenarios.projects.populated.id,
      [{ nodeType: "feedback", id: readScenarios.nodes.unknown }],
      1,
    );
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect({
      status: response.status,
      body: stabilizeBatchResponseForSnapshot(body),
    }).toMatchSnapshot();
  });

  externalTest("snapshots the retained version-two full payload", async () => {
    const response = await batch(
      readScenarios.projects.versionTwo.id,
      [{ nodeType: "feedback", id: readScenarios.nodes.versionTwo }],
      2,
    );
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect({
      status: response.status,
      body: stabilizeBatchResponseForSnapshot(body),
    }).toMatchSnapshot();
  });

});
