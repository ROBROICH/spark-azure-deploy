import { describe, expect, test } from "bun:test";

import { CommentListSchema, parseReadContract } from "./support/read-contracts.ts";

const validComment = {
  id: "62000000-0000-4000-8000-000000000001",
  projectId: "61000000-0000-4000-8000-000000000001",
  title: "Synthetic title",
  content: "Synthetic content",
  processStep: "unsorted",
  sourceRef: null,
  createdAt: "2026-01-10T08:00:00Z",
  updatedAt: "2026-01-10T08:00:00Z",
} as const;

describe("Comment read contracts", () => {
  test("validate the original value before parsing", () => {
    expect(parseReadContract(CommentListSchema, [validComment])).toEqual([validComment]);
  });

  test("removes undeclared response properties from the parsed result", () => {
    const parsed = parseReadContract(CommentListSchema, [
      { ...validComment, incidental: "not contracted" },
    ]);

    expect(parsed).toEqual([validComment]);
  });

  test("reject malformed nested source references", () => {
    expect(() =>
      parseReadContract(CommentListSchema, [
        { ...validComment, sourceRef: { type: "manual", itemId: null, extra: true } },
      ]),
    ).toThrow();
  });

  test("require an item identifier for a concrete source reference", () => {
    expect(() =>
      parseReadContract(CommentListSchema, [
        { ...validComment, sourceRef: { type: "materialNorm", itemId: null } },
      ]),
    ).toThrow();
  });
});
