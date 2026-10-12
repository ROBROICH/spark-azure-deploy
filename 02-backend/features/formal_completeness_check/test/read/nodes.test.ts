import { describe, expect } from "bun:test";
import type { Static } from "@sinclair/typebox";

import {
  BatchNodesResponseSchema,
  NodeListSchema,
  type NodeType,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const canonicalNodeList = (body: Static<typeof NodeListSchema>) => ({
  nodes: body.nodes
    .map((node) => ({
      ...node,
      parents: [...node.parents].sort((left, right) =>
        `${left.nodeType}:${left.id}`.localeCompare(`${right.nodeType}:${right.id}`),
      ),
    }))
    .sort((left, right) =>
      `${left.nodeType}:${left.id}`.localeCompare(`${right.nodeType}:${right.id}`),
    ),
});

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

describe("GET /{project_id}/nodes HTTP read contract", () => {
  externalTest("snapshots all active current node families and parent references", async () => {
    const response = await readJson(
      `/${readScenarios.projects.populated.id}/nodes?projectVersion=3`,
    );
    const body = canonicalNodeList(parseReadContract(NodeListSchema, response.body));

    expect(new Set(body.nodes.map(({ nodeType }) => nodeType))).toEqual(
      new Set([
        "category",
        "document_type",
        "document",
        "project_template_version",
        "table_of_content_notes",
        "toc_job_status",
      ]),
    );
    expect(body.nodes.map(({ id }) => id)).not.toContain(readScenarios.categories.currentDeleted);
    expect(body.nodes.map(({ id }) => id)).not.toContain(
      readScenarios.documentTypes.currentDeleted,
    );
    expect(body.nodes.map(({ id }) => id)).not.toContain(readScenarios.toc.deleted);
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots historical, empty, and omitted-version node reads", async () => {
    const historical = await readJson(
      `/${readScenarios.projects.populated.id}/nodes?projectVersion=2`,
    );
    const empty = await readJson(`/${readScenarios.projects.empty.id}/nodes?projectVersion=1`);
    const explicit = await readJson(
      `/${readScenarios.projects.populated.id}/nodes?projectVersion=3`,
    );
    const implicit = await readJson(`/${readScenarios.projects.populated.id}/nodes`);
    const payloads = [historical, empty, implicit].map(({ status, body }) => ({
      status,
      body: canonicalNodeList(parseReadContract(NodeListSchema, body)),
    }));
    const explicitBody = canonicalNodeList(parseReadContract(NodeListSchema, explicit.body));

    expect(payloads[2]?.body).toEqual(explicitBody);
    expect(payloads).toMatchSnapshot();
  });
});

describe("POST /{project_id}/batch-nodes HTTP read contract", () => {
  externalTest("snapshots an empty request", async () => {
    const response = await batch(readScenarios.projects.populated.id, [], 3);
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("parses full mixed payloads and omits unknown or soft-deleted IDs", async () => {
    const response = await batch(
      readScenarios.projects.populated.id,
      [
        { nodeType: "document", id: readScenarios.documents.currentHumanOverride },
        { nodeType: "category", id: readScenarios.categories.currentGeneral },
        {
          nodeType: "document_type",
          id: readScenarios.documentTypes.currentEnvironmentalReport,
        },
        {
          nodeType: "project_template_version",
          id: readScenarios.projectTemplateVersions.current,
        },
        { nodeType: "table_of_content_notes", id: readScenarios.toc.newestResolved },
        { nodeType: "toc_job_status", id: readScenarios.toc.successStatus },
        { nodeType: "document", id: readScenarios.documents.unknown },
        { nodeType: "category", id: readScenarios.categories.currentDeleted },
      ],
      3,
    );
    const body = parseReadContract(BatchNodesResponseSchema, response.body);

    expect(body.results).toHaveLength(6);
    expect(body.results.map(({ id }) => id)).not.toContain(readScenarios.documents.unknown);
    expect(body.results.map(({ id }) => id)).not.toContain(readScenarios.categories.currentDeleted);
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("snapshots historical and omitted-version lookups", async () => {
    const historical = await batch(
      readScenarios.projects.populated.id,
      [
        { nodeType: "category", id: readScenarios.categories.historical },
        { nodeType: "document", id: readScenarios.documents.historicalAssigned },
      ],
      2,
    );
    const refs = [
      { nodeType: "document_type" as const, id: readScenarios.documentTypes.currentApplication },
    ];
    const explicit = await batch(readScenarios.projects.populated.id, refs, 3);
    const implicit = await batch(readScenarios.projects.populated.id, refs);
    const historicalBody = parseReadContract(BatchNodesResponseSchema, historical.body);
    const implicitBody = parseReadContract(BatchNodesResponseSchema, implicit.body);
    const explicitBody = parseReadContract(BatchNodesResponseSchema, explicit.body);

    expect(implicitBody).toEqual(explicitBody);
    expect({
      historical: { status: historical.status, body: historicalBody },
      implicit: { status: implicit.status, body: implicitBody },
    }).toMatchSnapshot();
  });
});
