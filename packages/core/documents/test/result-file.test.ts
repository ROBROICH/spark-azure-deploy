import { describe, expect, test } from "bun:test";
import { Type } from "@sinclair/typebox";

import { dmsErrors } from "../src/errors.ts";
import { loadResultFile } from "../src/result-file.ts";

const fileId = "52000000-0000-4000-8000-000000000001";
const projectId = "52000000-0000-4000-8000-000000000002";
const otherProjectId = "52000000-0000-4000-8000-000000000003";
const ResultSchema = Type.Object({ complete: Type.Boolean() });

const returning = (owner: string | null, content: string) => ({
  async readResultFile() {
    return { projectId: owner, projectVersion: 4, bytes: new TextEncoder().encode(content) };
  },
});

const throwing = (cause: Error) => ({
  async readResultFile(): Promise<never> {
    throw cause;
  },
});

describe("loadResultFile", () => {
  test("reads, scopes, and parses a project-owned result file", async () => {
    const calls: Array<{ fileId: string; projectVersion: number | undefined }> = [];
    const result = await loadResultFile(
      {
        async readResultFile(requestedFileId, projectVersion) {
          calls.push({ fileId: requestedFileId, projectVersion });
          return {
            projectId,
            projectVersion: 4,
            bytes: new TextEncoder().encode('{"complete":true}'),
          };
        },
      },
      ResultSchema,
      fileId,
      projectId,
      3,
    );

    expect(result.unwrap()).toEqual({
      projectVersion: 4,
      payload: { complete: true },
      digest: new Bun.CryptoHasher("sha256").update('{"complete":true}').digest("hex"),
    });
    expect(calls).toEqual([{ fileId, projectVersion: 3 }]);
  });

  test("identifies the returned result bytes before JSON whitespace is normalized", async () => {
    const load = (content: string) =>
      loadResultFile(returning(projectId, content), ResultSchema, fileId, projectId);
    const first = (await load('{"complete":true}')).unwrap();
    const repeated = (await load('{"complete":true}')).unwrap();
    const spaced = (await load('{ "complete": true }')).unwrap();
    expect(repeated.digest).toBe(first.digest);
    expect(spaced.payload).toEqual(first.payload);
    expect(spaced.digest).not.toBe(first.digest);
  });

  test("propagates Document Management errors and maps other read failures to unavailable", async () => {
    for (const cause of [dmsErrors.NOT_FOUND(), dmsErrors.CONFLICT(), dmsErrors.STORAGE_NOT_FOUND()]) {
      const result = await loadResultFile(throwing(cause), ResultSchema, fileId, projectId);
      expect(result.status).toBe("error");
      expect(result.isErr() && result.error).toBe(cause);
    }
    const unknown = await loadResultFile(throwing(new Error("socket closed")), ResultSchema, fileId, projectId);
    expect(unknown.isErr() && unknown.error.code).toBe(dmsErrors.STORAGE_UNAVAILABLE.code);
  });

  test("answers 404 for a file without or with another project", async () => {
    for (const owner of [null, otherProjectId]) {
      const result = await loadResultFile(returning(owner, "{}"), ResultSchema, fileId, projectId);
      expect(result.status).toBe("error");
      expect(result.isErr() && result.error.code).toBe(dmsErrors.NOT_FOUND.code);
    }
  });

  test("answers 422 for result content that is not JSON or not the result contract", async () => {
    for (const content of ["not-json", '{"complete":"yes"}']) {
      const result = await loadResultFile(returning(projectId, content), ResultSchema, fileId, projectId);
      expect(result.status).toBe("error");
      expect(result.isErr() && result.error.code).toBe(dmsErrors.INVALID_REQUEST.code);
    }
  });
});
