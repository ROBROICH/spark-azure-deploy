import { describe, expect } from "bun:test"

import {
  BatchNodesResponseSchema,
  NodeListSchema,
  canonicalizeUnorderedNodeList,
  parseReadContract,
} from "../support/read-contracts.ts"
import { externalTest, readJson } from "../support/external-app.ts"
import { readScenarios } from "../support/read-scenarios.ts"

type NodeRef = { nodeType: "file" | "file_topic" | "zip_file"; id: string }

const batch = (projectId: string, nodes: NodeRef[], version?: number) =>
  readJson(
    `/${projectId}/batch-nodes${version === undefined ? "" : `?projectVersion=${version}`}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nodes }),
    },
  )

describe("GET /{project_id}/nodes HTTP contract", () => {
  externalTest("snapshots current nodes and excludes soft-deleted rows", async () => {
    const response = await readJson(
      `/${readScenarios.projects.populated.id}/nodes?projectVersion=3`,
    )
    const body = canonicalizeUnorderedNodeList(parseReadContract(NodeListSchema, response.body))

    expect(body.nodes.map((node) => node.id)).not.toContain(readScenarios.files.deleted)
    expect(body.nodes.some((node) => node.nodeType === "file_topic")).toBe(true)
    expect(body.nodes.some((node) => node.nodeType === "zip_file")).toBe(true)
    expect({ status: response.status, body }).toMatchSnapshot()
  })

  externalTest("snapshots the explicit historical project version", async () => {
    const response = await readJson(
      `/${readScenarios.projects.populated.id}/nodes?projectVersion=2`,
    )
    const body = canonicalizeUnorderedNodeList(parseReadContract(NodeListSchema, response.body))

    expect({ status: response.status, body }).toMatchSnapshot()
  })

  externalTest("omitted version resolves to the same current payload from core", async () => {
    const explicit = await readJson(
      `/${readScenarios.projects.populated.id}/nodes?projectVersion=3`,
    )
    const implicit = await readJson(`/${readScenarios.projects.populated.id}/nodes`)
    const implicitBody = canonicalizeUnorderedNodeList(
      parseReadContract(NodeListSchema, implicit.body),
    )
    const explicitBody = canonicalizeUnorderedNodeList(
      parseReadContract(NodeListSchema, explicit.body),
    )

    expect(implicitBody).toEqual(explicitBody)
    expect({ status: implicit.status, body: implicitBody }).toMatchSnapshot()
  })

  externalTest("snapshots an empty project", async () => {
    const response = await readJson(`/${readScenarios.projects.empty.id}/nodes?projectVersion=1`)
    const body = canonicalizeUnorderedNodeList(parseReadContract(NodeListSchema, response.body))

    expect({ status: response.status, body }).toMatchSnapshot()
  })

  externalTest("snapshots an invalid explicit version", async () => {
    const response = await readJson(
      `/${readScenarios.projects.populated.id}/nodes?projectVersion=0`,
    )
    const body = canonicalizeUnorderedNodeList(parseReadContract(NodeListSchema, response.body))

    expect({ status: response.status, body }).toMatchSnapshot()
  })
})

describe("POST /{project_id}/batch-nodes HTTP contract", () => {
  externalTest("snapshots an empty request", async () => {
    const response = await batch(readScenarios.projects.populated.id, [], 3)
    const body = parseReadContract(BatchNodesResponseSchema, response.body)

    expect({ status: response.status, body }).toMatchSnapshot()
  })

  externalTest("parses complete mixed node payloads and snapshots incumbent ordering", async () => {
    const response = await batch(
      readScenarios.projects.populated.id,
      [
        { nodeType: "zip_file", id: readScenarios.zips.emptyDiff },
        { nodeType: "file", id: readScenarios.files.alpha },
        { nodeType: "file_topic", id: readScenarios.topics.alphaLink },
      ],
      3,
    )
    const body = parseReadContract(BatchNodesResponseSchema, response.body)

    expect(body.results.map((node) => node.nodeType)).toEqual([
      "zip_file",
      "file",
      "file_topic",
    ])
    expect({ status: response.status, body }).toMatchSnapshot()
  })

  externalTest("omits unknown, soft-deleted, and cross-project IDs", async () => {
    const response = await batch(
      readScenarios.projects.populated.id,
      [
        { nodeType: "file", id: readScenarios.files.unknown },
        { nodeType: "file", id: readScenarios.files.deleted },
        { nodeType: "file", id: readScenarios.files.otherProject },
      ],
      3,
    )
    const body = parseReadContract(BatchNodesResponseSchema, response.body)

    expect({ status: response.status, body }).toMatchSnapshot()
  })

  externalTest("snapshots an explicit historical lookup", async () => {
    const response = await batch(
      readScenarios.projects.populated.id,
      [
        { nodeType: "file", id: readScenarios.files.versioned },
        { nodeType: "zip_file", id: readScenarios.zips.versioned },
      ],
      2,
    )
    const body = parseReadContract(BatchNodesResponseSchema, response.body)

    expect({ status: response.status, body }).toMatchSnapshot()
  })

  externalTest("omitted version resolves to the same current lookup", async () => {
    const refs: NodeRef[] = [
      { nodeType: "file", id: readScenarios.files.versioned },
      { nodeType: "zip_file", id: readScenarios.zips.versioned },
    ]
    const explicit = await batch(readScenarios.projects.populated.id, refs, 3)
    const implicit = await batch(readScenarios.projects.populated.id, refs)
    const implicitBody = parseReadContract(BatchNodesResponseSchema, implicit.body)
    const explicitBody = parseReadContract(BatchNodesResponseSchema, explicit.body)

    expect(implicitBody).toEqual(explicitBody)
    expect({ status: implicit.status, body: implicitBody }).toMatchSnapshot()
  })

  externalTest("snapshots invalid node types and malformed IDs", async () => {
    const responses = await Promise.all([
      readJson(`/${readScenarios.projects.populated.id}/batch-nodes?projectVersion=3`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            nodes: [{ nodeType: "unknown", id: readScenarios.files.alpha }],
          }),
        }),
      readJson(`/${readScenarios.projects.populated.id}/batch-nodes?projectVersion=3`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nodes: [{ nodeType: "file", id: "not-a-uuid" }] }),
        }),
    ])
    expect(responses[0]!.status).toBe(422)
    expect([422, 500]).toContain(responses[1]!.status)
  })
})
