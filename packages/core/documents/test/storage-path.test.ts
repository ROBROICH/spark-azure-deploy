import { describe, expect, test } from "bun:test";
import { Redacted } from "effect";

import { Value } from "@sinclair/typebox/value";

import { mimeTypeForUpload } from "../src/files/file-types.ts";
import { buildObjectPath, sanitizeFilename } from "../src/files/object-path.ts";
import { S3Storage, StorageConflictError } from "../src/storage/s3-storage.ts";
import { FileUpdateRequestSchema, PublicUploadRequestSchema } from "../src/schemas.ts";

const projectId = "10000000-0000-4000-8000-000000000001";

describe("DMS object paths", () => {
  test("keeps the incumbent project, version, and file-type namespaces", () => {
    expect(
      buildObjectPath("basis.pdf", {
        type: "document",
        projectId,
        version: 2,
      }),
    ).toBe(`documents/${projectId}/v2/basis.pdf`);
    expect(
      buildObjectPath("bundle.zip", {
        type: "zip",
        projectId,
        version: 3,
      }),
    ).toBe(`zips/${projectId}/v3/bundle.zip`);
    expect(
      buildObjectPath("result.json", {
        type: "content_extraction",
        projectId,
        version: 4,
      }),
    ).toBe(`content_extraction/${projectId}/v4/result.json`);
    expect(
      buildObjectPath("law.json", {
        type: "law_data",
        version: 1,
      }),
    ).toBe("law_data/v1/law.json");
  });

  test("preserves nested safe names while removing traversal and unsafe characters", () => {
    expect(sanitizeFilename("../ reports /2026/../basis?.pdf")).toBe(
      "_reports_/2026/basis_.pdf",
    );
    expect(
      buildObjectPath("nested/über blick.pdf", {
        type: "template",
        projectId,
        version: 1,
      }),
    ).toBe(`templates/${projectId}/v1/nested/über_blick.pdf`);
    expect(() => sanitizeFilename("../..")).toThrow("Filename cannot be empty");
  });

  test("requires every identity needed by the selected path strategy", () => {
    expect(() =>
      buildObjectPath("basis.pdf", { type: "document", version: 1 }),
    ).toThrow("projectId is required for document");
    expect(() =>
      buildObjectPath("checkpoint.json", {
        type: "temporal_checkpoint",
        version: 1,
      }),
    ).toThrow("workflowId and runId are required for temporal_checkpoint");
  });
});

describe("DMS upload MIME contracts", () => {
  test("rejects client MIME edits and excessive filename depth on metadata and upload contracts", () => {
    expect(Value.Check(FileUpdateRequestSchema, { mimeType: "text/html" })).toBeFalse();
    for (const filename of [`${"folder/".repeat(32)}file.pdf`, `${"a".repeat(1024)}.pdf`]) {
      expect(Value.Check(FileUpdateRequestSchema, { filename })).toBeFalse();
      expect(
        Value.Check(PublicUploadRequestSchema, { type: "document", projectId, filename }),
      ).toBeFalse();
      expect(() => mimeTypeForUpload(filename, "document")).toThrow();
    }
    expect(
      Value.Check(FileUpdateRequestSchema, { filename: `${"a/".repeat(31)}file.pdf` }),
    ).toBeTrue();
  });

  test("selects the public and internal MIME types by normalized extension", () => {
    expect(mimeTypeForUpload("BASIS.PDF", "document")).toBe("application/pdf");
    expect(mimeTypeForUpload("bundle.zip", "zip")).toBe("application/zip");
    expect(mimeTypeForUpload("result.json", "content_extraction")).toBe(
      "application/json",
    );
    expect(mimeTypeForUpload("export.csv", "erwiderungs_export")).toBe("text/csv");
  });

  test("rejects an unsupported extension with the incumbent public message", () => {
    expect(() => mimeTypeForUpload("malware.exe", "document")).toThrow(
      "File type '.exe' is not supported. Allowed types: .jpeg, .jpg, .pdf, .png, .zip",
    );
  });
});

describe("DMS presigned upload contract", () => {
  test("allows only one concurrent non-overwriting PUT at the storage boundary", async () => {
    let stored: string | undefined;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        if (request.method === "HEAD")
          return new Response(null, { status: stored === undefined ? 404 : 200 });
        const bytes = await request.text();
        if (request.headers.get("if-none-match") === "*" && stored !== undefined) {
          return new Response("<Error><Code>PreconditionFailed</Code></Error>", { status: 412 });
        }
        stored = bytes;
        return new Response(null, { status: 200 });
      },
    });
    const storage = new S3Storage({
      bucket: "fixture",
      privateEndpoint: server.url.origin,
      publicEndpoint: server.url.origin,
      accessKeyId: Redacted.make("fixture"),
      secretAccessKey: Redacted.make("fixture"),
      region: "us-east-1",
    });
    try {
      const results = await Promise.allSettled([
        storage.upload("export.csv", new TextEncoder().encode("A")),
        storage.upload("export.csv", new TextEncoder().encode("B")),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const winner = stored;
      await expect(
        storage.upload("export.csv", new TextEncoder().encode("C")),
      ).rejects.toMatchObject({ code: StorageConflictError.code });
      expect(stored).toBe(winner);
    } finally {
      storage.close();
      server.stop(true);
    }
  });
  test("binds the issued MIME type into SigV4 signed headers", async () => {
    const storage = new S3Storage({
      bucket: "fixture",
      prefix: "qualification",
      privateEndpoint: "http://127.0.0.1:1",
      publicEndpoint: "http://127.0.0.1:1",
      accessKeyId: Redacted.make("fixture-access"),
      secretAccessKey: Redacted.make("fixture-secret"),
      region: "eu-west-1",
    });
    try {
      const signed = await storage.presignUpload("document.pdf", {
        expiresInSeconds: 60,
        contentType: "application/pdf",
        createNewVersion: true,
      });
      expect(new URL(signed).searchParams.get("X-Amz-SignedHeaders")?.split(";")).toContain(
        "content-type",
      );
    } finally {
      storage.close();
    }
  });
});
