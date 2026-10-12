import { describe, expect, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import { pgTable, uuid } from "drizzle-orm/pg-core";

import { defineNodeDescriptor, type NodeDescriptorInput } from "../src";
import {
  authors,
  representativeNodeMetadata,
  representativeNodes,
  representativeSchema,
} from "./fixtures/representative-app/schema";

const author = representativeNodes.find(({ nodeType }) => nodeType === "author")!;

type DescriptorInput = Parameters<typeof defineNodeDescriptor>[0];
type AuditChoiceIsRequired = DescriptorInput extends {
  readonly auditLogEnabled: boolean;
}
  ? true
  : false;
const auditChoiceIsRequired: AuditChoiceIsRequired = true;

const missingSystemColumns = pgTable("missing_system_columns", {
  id: uuid("id").notNull(),
});

const define = (
  nodeMetadata: NonNullable<
    NodeDescriptorInput<typeof representativeSchema>["nodeMetadata"]
  > = representativeNodeMetadata,
) =>
  defineNodeDescriptor({
    name: "invalid-definition-test",
    auditLogEnabled: true,
    schema: representativeSchema,
    nodeMetadata,
  });

describe("derived node definition validation", () => {
  test("requires every descriptor to choose its audit mode", () => {
    expect(auditChoiceIsRequired).toBeTrue();
  });

  test("rejects a schema without a versioned node table", () => {
    expect(() =>
      defineNodeDescriptor({
        name: "missing-system-columns",
        auditLogEnabled: true,
        schema: { missingSystemColumns },
      }),
    ).toThrow("Invalid node request");
  });

  test("rejects a public field absent from an explicit response schema", () => {
    expect(() =>
      define({
        ...representativeNodeMetadata,
        authors: {
          ...representativeNodeMetadata.authors,
          schemas: {
            ...author.schemas,
            response: Type.Omit(author.schemas.response, ["bio"]),
          },
        },
      }),
    ).toThrow("Invalid node request");
  });

  test("rejects rules and external parents for fields absent from Drizzle", () => {
    expect(() =>
      define({
        ...representativeNodeMetadata,
        authors: {
          ...representativeNodeMetadata.authors,
          fieldRules: {
            ...representativeNodeMetadata.authors.fieldRules,
            missingRule: {},
          },
        },
      }),
    ).toThrow("Invalid node request");

    expect(() =>
      define({
        ...representativeNodeMetadata,
        authors: {
          ...representativeNodeMetadata.authors,
          externalParents: [
            {
              kind: "external",
              field: "missing_parent",
              nodeType: "external",
              service: "external_service",
            },
          ],
        },
      }),
    ).toThrow("Invalid node request");
  });

  test("uses public node aliases for nodes and persisted parents", () => {
    const nodes = define({
      ...representativeNodeMetadata,
      authors: {
        ...representativeNodeMetadata.authors,
        nodeType: "writer",
      },
    }).nodes;

    expect(nodes.find(({ table }) => table === authors)?.nodeType).toBe("writer");
    expect(nodes.find(({ nodeType }) => nodeType === "book")?.parents).toContainEqual({
      kind: "persisted",
      field: "authorId",
      nodeType: "writer",
    });
  });
});
