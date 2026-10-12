import { describe, expect, test } from "bun:test";
import { createFeatureHttp, type HttpJson } from "@spark-workflow/http-host";
import { nodeDefinition } from "@spark-workflow/node-crud";
import { Value } from "@sinclair/typebox/value";

import { formalCompletenessDescriptor } from "../src/node/descriptor.ts";

process.env.AUTH_MODE = "disabled";

const projectId = "71000000-0000-4000-8000-000000000001";
const nodeId = "72000000-0000-4000-8000-000000000001";
const collection = (name: string) => `http://local/projects/${projectId}/${name}`;
const item = (name: string) => `${collection(name)}/${nodeId}?projectVersion=1`;

const request = (url: string, method: "POST" | "PATCH" | "DELETE", body?: HttpJson) =>
  new Request(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("Formal Completeness v2 mutation surface", () => {
  test.each(["insert", "patch"] as const)(
    "%s rejects client-authored TOC provenance",
    (operation) => {
      const contract = nodeDefinition(formalCompletenessDescriptor, "table_of_content_notes")
        .schemas[operation];
      expect(Value.Check(contract, { content: "Human note" })).toBe(true);
      for (const generatedKey of ["f".repeat(64), null]) {
        expect(Value.Check(contract, { content: "Human note", generatedKey })).toBe(false);
      }
    },
  );

  test("does not expose workflow-owned category, document, or TOC mutations", async () => {
    const { createV2Routes, feature } = await import("../src/index.ts");
    const app = createV2Routes(
      createFeatureHttp({
        get: async () => {
          throw new Error("Disabled routes must not resolve feature resources");
        },
        ready: async () => undefined,
        close: async () => undefined,
      }).for(feature),
    );

    for (const mutation of [
      request(`${collection("categories")}?projectVersion=1`, "POST", { name: "Unsafe" }),
      request(item("categories"), "PATCH", { name: "Unsafe" }),
      request(item("categories"), "DELETE"),
      request(`${collection("documents")}?projectVersion=1`, "POST", {
        documentName: "unsafe.pdf",
      }),
      request(item("documents"), "DELETE"),
      request(`${collection("table-of-content-notes")}?projectVersion=1`, "POST", {
        content: "Unsafe",
      }),
      request(item("table-of-content-notes"), "PATCH", { isResolved: true }),
      request(item("table-of-content-notes"), "DELETE"),
    ]) {
      expect((await app.handle(mutation)).status).toBe(404);
    }
  });

  test("rejects generic document and document-type mutation fields", async () => {
    const { createV2Routes, feature } = await import("../src/index.ts");
    const app = createV2Routes(
      createFeatureHttp({
        get: async () => {
          throw new Error("Invalid bodies must fail before feature resources resolve");
        },
        ready: async () => undefined,
        close: async () => undefined,
      }).for(feature),
    );

    const document = await app.handle(
      request(item("documents"), "PATCH", { documentName: "tampered.pdf" }),
    );
    expect(document.status).toBe(422);

    const documentType = await app.handle(
      request(`${collection("document-types")}?projectVersion=1`, "POST", {
        name: "Tampered type",
        origin: "system",
      }),
    );
    expect(documentType.status).toBe(422);
  });
});
