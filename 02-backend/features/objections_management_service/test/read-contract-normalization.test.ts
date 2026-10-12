import { describe, expect, test } from "bun:test";

import {
  ErrorResponseSchema,
  NodeListSchema,
  canonicalizeUnorderedNodeList,
  parseReadContract,
} from "./support/read-contracts.ts";

describe("Objections snapshot stabilization", () => {
  test("normalizes error responses to the declared contract", () => {
    expect(
      parseReadContract(ErrorResponseSchema, {
        detail: "project not found",
        undeclared: "not part of the response contract",
      }),
    ).toEqual({ detail: "project not found" });
  });

  test("canonicalizes only the parsed top-level node union by semantic identity", () => {
    const parsed = parseReadContract(NodeListSchema, {
      nodes: [
        {
          id: "62000000-0000-4000-8000-000000000002",
          nodeType: "beteiligungs_eingang_markdown",
          parents: [
            {
              id: "62000000-0000-4000-8000-000000000001",
              nodeType: "beteiligungs_eingang",
            },
          ],
          frontendParentIds: ["second", "first"],
          isOutdated: false,
        },
        {
          id: "62000000-0000-4000-8000-000000000003",
          nodeType: "argument",
          parents: [
            { id: "65000000-0000-4000-8000-000000000002", nodeType: "subtopic" },
            { id: "65000000-0000-4000-8000-000000000001", nodeType: "topic" },
          ],
          frontendParentIds: [],
          isOutdated: false,
        },
      ],
    });

    const canonical = canonicalizeUnorderedNodeList(parsed);

    expect(canonical.nodes.map(({ nodeType, id }) => `${nodeType}:${id}`)).toEqual([
      "argument:62000000-0000-4000-8000-000000000003",
      "beteiligungs_eingang_markdown:62000000-0000-4000-8000-000000000002",
    ]);
    expect(canonical.nodes[0]?.parents.map(({ id }) => id)).toEqual([
      "65000000-0000-4000-8000-000000000002",
      "65000000-0000-4000-8000-000000000001",
    ]);
    expect(parsed.nodes[0]?.nodeType).toBe("beteiligungs_eingang_markdown");
  });
});
