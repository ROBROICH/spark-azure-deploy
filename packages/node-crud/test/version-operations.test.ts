import { describe, expect, test } from "bun:test";
import { Result } from "better-result";

import type { NodeDefinition } from "../src/descriptor";
import { NodeVersionError } from "../src/errors";
import { mergeCopyVersionDirectives, orderedVersionNodes } from "../src/version-operations";
import { representativeNodes } from "./fixtures/representative-app/schema";

const AUTHOR = "00000000-0000-4000-8000-000000000001";
const BOOK = "00000000-0000-4000-8000-000000000002";

describe("project-version operation invariants", () => {
  test("merges duplicate directives deterministically", () => {
    expect(
      mergeCopyVersionDirectives([
        {
          nodeType: "book",
          id: BOOK,
          setOutdated: false,
          overrides: { title: "Retitled" },
        },
        {
          nodeType: "author",
          id: AUTHOR,
          setOutdated: false,
          overrides: { bio: "Biography" },
        },
        {
          nodeType: "author",
          id: AUTHOR,
          setOutdated: true,
          overrides: { name: "Renamed" },
        },
      ]),
    ).toEqual(
      Result.ok([
        {
          nodeType: "author",
          id: AUTHOR,
          setOutdated: true,
          overrides: { bio: "Biography", name: "Renamed" },
        },
        {
          nodeType: "book",
          id: BOOK,
          setOutdated: false,
          overrides: { title: "Retitled" },
        },
      ]),
    );
  });

  test("rejects conflicting duplicate overrides", () => {
    const result = mergeCopyVersionDirectives([
      {
        nodeType: "author",
        id: AUTHOR,
        setOutdated: false,
        overrides: { name: "First" },
      },
      {
        nodeType: "author",
        id: AUTHOR,
        setOutdated: false,
        overrides: { name: "Second" },
      },
    ]);
    expect(result.isErr()).toBeTrue();
    if (result.isErr()) {
      expect(result.error.toJSON()).toEqual(
        NodeVersionError({
          internal: { message: `Conflicting copy-version override for author:${AUTHOR}` },
        }).toJSON(),
      );
    }
  });

  test("orders persisted parents before copies and dependents before deletes", () => {
    const reversed = [...representativeNodes].reverse();
    expect(orderedVersionNodes(reversed, "copy").map(({ nodeType }) => nodeType)).toEqual([
      "author",
      "book",
      "topic_linked_note",
    ]);
    expect(orderedVersionNodes(reversed, "delete").map(({ nodeType }) => nodeType)).toEqual([
      "topic_linked_note",
      "book",
      "author",
    ]);
  });

  test("fails closed on cyclic rollback dependencies", () => {
    const author = representativeNodes.find(({ nodeType }) => nodeType === "author")!;
    const book = representativeNodes.find(({ nodeType }) => nodeType === "book")!;
    const cycle = [
      {
        ...author,
        parents: [{ kind: "persisted", field: "bio", nodeType: "book" }],
      },
      book,
    ] satisfies readonly NodeDefinition[];
    expect(() => orderedVersionNodes(cycle, "delete")).toThrow(
      "Cycle detected in node rollback dependencies at author",
    );
  });
});
