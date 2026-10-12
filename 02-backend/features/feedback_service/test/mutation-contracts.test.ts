import { describe, expect, test } from "bun:test";

import {
  CopyVersionResponseSchema,
  NodeMutationResponseSchema,
  UndoVersionResponseSchema,
  parseMutationContract,
} from "./support/mutation-contracts.ts";

const feedbackNode = {
  nodeType: "feedback" as const,
  isDeleted: false,
  rating: "positive" as const,
  reason: "Useful",
  text: "The explanation was clear.",
  userId: "53000000-0000-4000-8000-000000000001",
  id: "52000000-0000-4000-8000-000000000001",
  projectId: "51000000-0000-4000-8000-000000000001",
  isOutdated: false,
  frontendParentIds: ["frontend:review"],
  projectVersion: 1,
  updateType: "manual" as const,
  createdAt: "2026-07-16T20:10:11.123Z",
  updatedAt: "2026-07-16T20:10:11.123Z",
  sysPeriod: '["2026-07-16 20:10:11.123+00",)',
};

describe("strict Feedback mutation contracts", () => {
  test("parses complete update, copy, and undo responses on their original values", () => {
    expect(
      parseMutationContract(NodeMutationResponseSchema, {
        inserted: [feedbackNode],
        updated: [],
        deleted: [],
      }),
    ).toEqual({ inserted: [feedbackNode], updated: [], deleted: [] });
    expect(parseMutationContract(CopyVersionResponseSchema, { dryRun: false, copied: 1 })).toEqual({
      dryRun: false,
      copied: 1,
    });
    expect(parseMutationContract(UndoVersionResponseSchema, { deleted: { feedback: 1 } })).toEqual({
      deleted: { feedback: 1 },
    });
  });

  test("removes undeclared nested fields from the parsed result", () => {
    const parsed = parseMutationContract(NodeMutationResponseSchema, {
      inserted: [{ ...feedbackNode, undeclared: true }],
      updated: [],
      deleted: [],
    });

    expect(parsed).toEqual({ inserted: [feedbackNode], updated: [], deleted: [] });
    expect(Object.hasOwn(parsed.inserted[0] ?? {}, "undeclared")).toBeFalse();
  });
});
