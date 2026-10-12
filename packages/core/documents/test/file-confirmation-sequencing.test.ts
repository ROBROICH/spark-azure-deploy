import { describe, expect, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { Redacted } from "effect";

import type { DmsDatabase, DmsScope } from "../src/db.ts";
import { files, zipFiles } from "../src/db/schema.ts";
import { FileService } from "../src/files/file-service.ts";
import { buildObjectPath } from "../src/files/object-path.ts";
import { S3Storage } from "../src/storage/s3-storage.ts";

const projectId = "10000000-0000-4000-8000-000000000001";
const fileId = "20000000-0000-4000-8000-000000000001";
const filename = "confirmation.pdf";

const confirmationHarness = ({
  failPending = false,
  maxObjectBytes = 12,
  contentLength = 12,
  type = "document",
}: {
  failPending?: boolean;
  maxObjectBytes?: number;
  contentLength?: number | null;
  type?: "document" | "zip" | "ewms_zip";
} = {}) => {
  const events: string[] = [];
  const selections: unknown[] = type === "document" ? [[{ value: null }], []] : [[]];
  const expectedPath = buildObjectPath(type === "document" ? filename : "archive.zip", {
    type,
    projectId,
    version: 1,
    revisionId: "project-1",
  });
  let transactionNumber = 0;
  let row: typeof files.$inferSelect | undefined;
  let activeDatabase: DmsDatabase | undefined;

  const database: DmsDatabase = Object.assign(Object.create(null), {
    select: () => ({
      from: () => ({
        where: () => {
          events.push("select");
          const result = selections.shift();
          return Object.assign(Promise.resolve(result), {
            orderBy: () => ({ limit: async () => result }),
          });
        },
      }),
    }),
  });
  const scope: DmsScope = {
    query: (callback) => callback(activeDatabase ?? database),
    streamRows: async function* () {
      yield* [];
    },
    transact: async (callback) => {
      transactionNumber += 1;
      const currentTransaction = transactionNumber;
      events.push(`transaction:${currentTransaction}:begin`);
      activeDatabase = Object.assign(Object.create(null), {
        insert: (table: typeof files | typeof zipFiles | typeof auditLogs) => ({
          values: (value: typeof files.$inferInsert) => {
            if (table === zipFiles) {
              events.push("zip:insert");
              return { returning: async () => [{ ...value, id: fileId }] };
            }
            if (table === files) {
              row = {
                id: fileId,
                mimeType: value.mimeType!,
                bucketPath: value.bucketPath!,
                projectId: value.projectId ?? null,
                createdAt: value.createdAt ?? new Date("2026-07-17T08:00:00Z"),
                updatedAt: value.updatedAt ?? new Date("2026-07-17T08:00:00Z"),
                type: value.type!,
                filename: value.filename!,
                workflowId: value.workflowId ?? null,
                runId: value.runId ?? null,
                isDeleted: value.isDeleted!,
                version: value.version ?? 1,
                frontendParentIds: value.frontendParentIds ?? [],
                updateType: value.updateType ?? null,
                sysPeriod: '["2026-07-17 08:00:00+00",)',
                vectorSearchable: null,
                sourceZipFileId: null,
                workflowStatus: value.workflowStatus ?? null,
                addedInVersion: value.addedInVersion ?? null,
                isOutdated: value.isOutdated ?? false,
                projectVersion: value.projectVersion ?? 1,
              };
              events.push(`file:insert:${String(row.workflowStatus)}`);
              return { returning: async () => [row!] };
            }
            events.push("audit:insert");
            return {};
          },
        }),
        update: (table: typeof files) => ({
          set: (values: Partial<typeof files.$inferInsert>) => ({
            where: () => ({
              returning: async () => {
                expect(table).toBe(files);
                events.push(`file:update:${String(values.workflowStatus)}`);
                if (failPending) throw new Error("pending update failed");
                if (row === undefined) throw new Error("file row was not inserted");
                Object.assign(row, values);
                return [row];
              },
            }),
          }),
        }),
      });

      try {
        const result = await callback();
        events.push(`transaction:${currentTransaction}:commit`);
        return result;
      } catch (error) {
        events.push(`transaction:${currentTransaction}:rollback`);
        throw error;
      } finally {
        activeDatabase = undefined;
      }
    },
  };

  const projectVersions = {
    latestOne: async () => 1,
    ensureWritable: async (requestedProjectId: string, version: number) => {
      expect({ requestedProjectId, version }).toEqual({
        requestedProjectId: projectId,
        version: 1,
      });
      events.push("project:validate-write");
      return 1;
    },
  };
  const storageConfig = {
    bucket: "unused",
    privateEndpoint: "http://unused.invalid",
    publicEndpoint: "http://unused.invalid",
    accessKeyId: Redacted.make("unused"),
    secretAccessKey: Redacted.make("unused"),
    region: "unused",
  };
  const quarantine = Object.assign(new S3Storage(storageConfig), {
    head: async () => {
      events.push("storage:head");
      return {
        contentLength,
        contentType: type === "document" ? "application/pdf" : "application/zip",
        metadata: {},
      };
    },
    delete: async (path: string) => {
      events.push(`storage:delete:${path}`);
    },
  });
  const clean = new S3Storage(storageConfig);
  const service = new FileService(scope, projectVersions, clean, quarantine, true, maxObjectBytes);

  return { events, service, expectedPath };
};

describe("Document Management public confirmation sequencing", () => {
  test("commits the insert before the unaudited PENDING transition", async () => {
    const { events, service } = confirmationHarness();

    const result = await service.confirmUpload(
      { type: "document", projectId, filename, createNewVersion: false },
      1,
    );

    expect(result).toMatchObject({
      id: fileId,
      projectId,
      workflowStatus: "PENDING",
    });
    expect(events).toEqual([
      "project:validate-write",
      "select",
      "select",
      "storage:head",
      "transaction:1:begin",
      "project:validate-write",
      "file:insert:null",
      "audit:insert",
      "transaction:1:commit",
      "transaction:2:begin",
      "file:update:PENDING",
      "transaction:2:commit",
    ]);
  });

  test("does not delete an accepted upload when the post-commit transition fails", async () => {
    const { events, service, expectedPath } = confirmationHarness({ failPending: true });

    expect(
      await service
        .confirmUpload({ type: "document", projectId, filename, createNewVersion: false }, 1)
        .catch((error) => error),
    ).toHaveProperty("message", "pending update failed");

    expect(events).toContain("transaction:1:commit");
    expect(events).toContain("transaction:2:rollback");
    expect(events).not.toContain(`storage:delete:${expectedPath}`);
    expect(events.filter((event) => event === "audit:insert")).toHaveLength(1);
  });

  test("rejects and deletes an uploaded object larger than the admission limit", async () => {
    const { events, service, expectedPath } = confirmationHarness({ maxObjectBytes: 11 });

    const error = await service
      .confirmUpload({ type: "document", projectId, filename, createNewVersion: false }, 1)
      .then(
        () => undefined,
        (cause: unknown) => cause,
      );

    expect(error).toMatchObject({ status: 422 });
    expect(events).toContain(`storage:delete:${expectedPath}`);
    expect(events.filter((event) => event.startsWith("transaction:"))).toEqual([]);
  });

  for (const type of ["zip", "ewms_zip"] as const) {
    test(`confirms a large ${type} without applying the individual-file limit`, async () => {
      const { events, service, expectedPath } = confirmationHarness({
        type,
        maxObjectBytes: 1_073_741_824,
        contentLength: 2_231_099_671,
      });
      const result = await service.confirmUpload(
        { type, projectId, filename: "archive.zip", createNewVersion: false },
        1,
      );

      expect(result).toMatchObject({
        id: fileId,
        projectId,
        filename: "archive.zip",
        workflowStatus: "PENDING",
      });
      expect(events).toContain("zip:insert");
      expect(events).toContain("transaction:1:commit");
      expect(events.filter((event) => event === "audit:insert")).toHaveLength(1);
      expect(events).not.toContain(`storage:delete:${expectedPath}`);
    });
  }

  for (const type of ["document", "zip", "ewms_zip"] as const) {
    test(`rejects ${type} when storage does not report its size`, async () => {
      const { events, service, expectedPath } = confirmationHarness({ type, contentLength: null });
      const error = await service
        .confirmUpload(
          {
            type,
            projectId,
            filename: type === "document" ? filename : "archive.zip",
            createNewVersion: false,
          },
          1,
        )
        .catch((cause: unknown) => cause);

      expect(error).toMatchObject({ status: 422 });
      expect(events).toContain(`storage:delete:${expectedPath}`);
      expect(events.filter((event) => event.startsWith("transaction:"))).toEqual([]);
    });
  }
});
