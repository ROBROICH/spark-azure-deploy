import { expect, test } from "bun:test";

import { canonicalizeOpenApiSchemaReferences } from "../src/openapi.ts";

const schemaReferencePrefix = "#/components/schemas/";

test("promotes inline schemas and qualifies their references", () => {
  const document = {
    openapi: "3.1.0",
    paths: {
      "/items": {
        schema: {
          $defs: {
            Item: {
              type: "object",
              properties: { child: { $ref: "Child" } },
            },
            Child: { type: "string" },
            Unused: { type: "boolean" },
          },
          $ref: "Item",
        },
      },
    },
  };

  expect(canonicalizeOpenApiSchemaReferences(document)).toEqual({
    openapi: "3.1.0",
    paths: {
      "/items": {
        schema: { $ref: `${schemaReferencePrefix}Item` },
      },
    },
    components: {
      schemas: {
        Item: {
          type: "object",
          properties: { child: { $ref: `${schemaReferencePrefix}Child` } },
        },
        Child: { type: "string" },
        Unused: { type: "boolean" },
      },
    },
  });
});

test("rejects conflicting schema definitions", () => {
  expect(() =>
    canonicalizeOpenApiSchemaReferences({
      paths: {
        "/one": { $defs: { Item: { type: "string" } } },
        "/two": { $defs: { Item: { type: "number" } } },
      },
    }),
  ).toThrow("Conflicting OpenAPI schema 'Item'");

  expect(() =>
    canonicalizeOpenApiSchemaReferences({
      components: { schemas: { Item: { type: "string" } } },
      paths: { "/items": { $defs: { Item: { type: "number" } } } },
    }),
  ).toThrow("Conflicting OpenAPI schema 'Item'");
});

test("rejects unresolved local schema references", () => {
  expect(() =>
    canonicalizeOpenApiSchemaReferences({
      paths: { "/items": { schema: { $ref: `${schemaReferencePrefix}Missing` } } },
    }),
  ).toThrow(`OpenAPI schema reference '${schemaReferencePrefix}Missing' does not resolve`);
});
