import { describe, expect, test } from "bun:test"

import { normalizePdfTocDotLeaders } from "./support/documents.ts"
import {
  ErrorResponseSchema,
  NodeListSchema,
  canonicalizeUnorderedNodeList,
  parseReadContract,
} from "./support/read-contracts.ts"

describe("Administrative File Draft read contracts", () => {
  test("parses declared response fields and removes undeclared properties", () => {
    const parsed = parseReadContract(ErrorResponseSchema, {
      detail: "Synthetic error",
      undeclared: true,
    })

    expect(parsed).toEqual({ detail: "Synthetic error" })
  })

  test("canonicalizes only the parsed top-level node union by semantic identity", () => {
    const parsed = parseReadContract(NodeListSchema, {
      nodes: [
        {
          id: "20000000-0000-4000-8000-000000000002",
          nodeType: "vae_node",
          parents: [
            { id: "50000000-0000-4000-8000-000000000002", nodeType: "topic" },
            { id: "50000000-0000-4000-8000-000000000001", nodeType: "subtopic" },
          ],
          frontendParentIds: ["second", "first"],
          isOutdated: false,
        },
        {
          id: "40000000-0000-4000-8000-000000000001",
          nodeType: "risks",
          parents: [],
          frontendParentIds: [],
          isOutdated: false,
        },
      ],
    })

    const canonical = canonicalizeUnorderedNodeList(parsed)

    expect(canonical.nodes.map(({ nodeType, id }) => `${nodeType}:${id}`)).toEqual([
      "risks:40000000-0000-4000-8000-000000000001",
      "vae_node:20000000-0000-4000-8000-000000000002",
    ])
    expect(canonical.nodes[1]?.parents.map(({ id }) => id)).toEqual([
      "50000000-0000-4000-8000-000000000002",
      "50000000-0000-4000-8000-000000000001",
    ])
    expect(parsed.nodes[0]?.nodeType).toBe("vae_node")
  })

  test("normalizes only converter-sensitive PDF table-of-contents dot leaders", () => {
    expect(
      normalizePdfTocDotLeaders(
        "A. Überblick................................5 Mehr........12 Wait... unchanged. Section 1.2 stays.",
      ),
    ).toBe("A. Überblick....5 Mehr....12 Wait... unchanged. Section 1.2 stays.")
  })
})
