import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { eq, inArray, sql } from "drizzle-orm";
import type { DocumentManagementFileProcessingTemporalInput } from "@spark-temporal/contracts";
import { Client, Connection } from "@temporalio/client";
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import { createDocumentFilesService } from "../src/data.ts";
import { DrizzleDmsActivityRepository } from "../src/temporal/activity-repository.ts";
import { S3Storage } from "../src/storage/s3-storage.ts";
import { ScanAndPromoteService } from "../src/scanner/scan-and-promote.ts";

import { coreSchema } from "../../src/schema.ts";
import { projects, projectHistory, projectVersionLocks } from "../../projects/src/db/schema.ts";
import {
  files,
  fileHistory,
  zipFiles,
  zipFileHistory,
  zipFileDiffEntries,
} from "../src/db/schema.ts";
import { parseDocumentConfiguration } from "../src/env.ts";
import { DocumentRuntime } from "../src/runtime.ts";
import { DocumentTemporalCommandsService } from "../src/temporal/commands.ts";

const databaseUrl = process.env.DMS_MUTATION_DATABASE_URL;
const schema = { ...coreSchema, auditLogs };

describe.skipIf(databaseUrl === undefined)("DMS durable lifecycle admission", () => {
  let database: PostgresResourceRuntime<typeof schema>;
  let documents: DocumentRuntime;
  let commands: DocumentTemporalCommandsService;
  const projectIds: string[] = [];
  const starts: DocumentManagementFileProcessingTemporalInput[] = [];
  let approve: () => Promise<{ newVersion: number | null }>;

  beforeAll(async () => {
    database = createPostgresRuntime({
      url: databaseUrl!,
      schema,
      pool: {
        maxConnections: 6,
        idleTimeoutSeconds: 5,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 60,
        closeTimeoutSeconds: 5,
      },
    });
    await database.ready();
    commands = Object.assign(
      new DocumentTemporalCommandsService({
        temporalHost: "127.0.0.1:1",
        temporalNamespace: "default",
      }),
      {
        async startFileProcessing(input: DocumentManagementFileProcessingTemporalInput) {
          starts.push(input);
          return {
            workflowId: input.request.executionId,
            runId: crypto.randomUUID(),
            workflowStatus: "RUNNING" as const,
          };
        },
        executeProjectVersionApproval: () => approve(),
      },
    );
    documents = new DocumentRuntime(
      database,
      parseDocumentConfiguration({
        ENV: "local",
        CLAMAV_ENABLED: "false",
        CLAMAV_BASE_URL: "http://127.0.0.1:1",
        BUCKET_NAME: "b03-clean",
        S3_ACCESS_KEY_ID: "deepsec_local",
        S3_SECRET_ACCESS_KEY: "deepsec_local_only",
        S3_ENDPOINT_URL: process.env.DMS_TEST_S3_ENDPOINT ?? "http://127.0.0.1:1",
        S3_EXTERNAL_URL: process.env.DMS_TEST_S3_ENDPOINT ?? "http://127.0.0.1:1",
        S3_REGION: "us-east-1",
        MAX_OBJECT_SIZE_MB: "1",
      }),
      commands,
    );
  });

  afterAll(async () => {
    await database.query(async (query) => {
      for (const table of [
        zipFileDiffEntries,
        projectVersionLocks,
        files,
        fileHistory,
        zipFiles,
        zipFileHistory,
        auditLogs,
        projects,
        projectHistory,
      ]) {
        if ("projectId" in table)
          await query.delete(table).where(inArray(table.projectId, projectIds));
        else await query.delete(table).where(inArray(table.id, projectIds));
      }
    });
    await documents.close();
    await commands.close();
    await database.close();
  });

  test("admits an existing pending project template to the same scan workflow", async () => {
    const projectId = crypto.randomUUID();
    const fileId = crypto.randomUUID();
    projectIds.push(projectId);
    await database.query(async (query) => {
      await query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() });
      await query.insert(files).values({
        id: fileId,
        projectId,
        projectVersion: 1,
        type: "TEMPLATE",
        filename: "template.pdf",
        bucketPath: `templates/${projectId}/template.pdf`,
        mimeType: "application/pdf",
        workflowStatus: "PENDING",
        isDeleted: false,
      });
    });
    const result = await documents.mutations.startFileProcessing({ fileId, projectId });
    expect(result.workflowStatus).toBe("RUNNING");
    expect(starts.at(-1)?.request.workflowInput).toMatchObject({
      fileId,
      projectId,
      fileType: "template",
      filename: "template.pdf",
    });
  });

  test("freezes decisions before dispatch and rejects concurrent editing and rejection", async () => {
    const projectId = crypto.randomUUID();
    const zipId = crypto.randomUUID();
    projectIds.push(projectId);
    await database.query(async (query) => {
      await query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() });
      await query.insert(zipFiles).values({
        id: zipId,
        projectId,
        projectVersion: 1,
        filename: "archive.zip",
        bucketPath: `zips/${zipId}`,
        sourceProjectVersion: 1,
        approvalStatus: "REQUIRES_APPROVAL",
        workflowStatus: "COMPLETED",
        isDeleted: false,
      });
    });
    let dispatched!: () => void;
    const dispatch = new Promise<void>((resolve) => {
      dispatched = resolve;
    });
    let finish!: () => void;
    const completion = new Promise<void>((resolve) => {
      finish = resolve;
    });
    approve = async () => {
      dispatched();
      await completion;
      return { newVersion: 2 };
    };
    const approval = documents.mutations.submitDecision(zipId, "approve");
    try {
      await dispatch;
      await expect(documents.mutations.submitDecision(zipId, "reject")).rejects.toMatchObject({
        status: 409,
      });
      await expect(
        documents.mutations.updateZipApprovalStatus(projectId, zipId, "REJECTED", null),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        documents.mutations.updateZipApprovalStatus(projectId, zipId, "REQUIRES_APPROVAL", null),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        documents.mutations.setDiff(zipId, {
          new: [],
          changed: [],
          deleted: [],
          renamed: [],
          unchanged: [],
        }),
      ).rejects.toMatchObject({ status: 409 });
      const rows = await database.query((query) =>
        query.select().from(zipFiles).where(eq(zipFiles.id, zipId)),
      );
      expect(rows[0]?.approvalStatus).toBe("APPROVING");
    } finally {
      finish();
      await approval;
    }
  });

  test("retains omitted new entries as exclusions without accepting missing existing decisions", async () => {
    const projectId = crypto.randomUUID();
    const zipId = crypto.randomUUID();
    const existingId = crypto.randomUUID();
    projectIds.push(projectId);
    const added = { filename: "new.pdf", bucketPath: `tmp/${zipId}/new.pdf`, sha: "new-digest" };
    const existing = { fileId: existingId, filename: "existing.pdf", sha: "old-digest" };
    await database.query(async (query) => {
      await query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() });
      await query.insert(zipFiles).values({
        id: zipId,
        projectId,
        projectVersion: 1,
        filename: "selection.zip",
        bucketPath: `zips/${zipId}`,
        sourceProjectVersion: 1,
        approvalStatus: "REQUIRES_APPROVAL",
        workflowStatus: "COMPLETED",
        isDeleted: false,
      });
      await query.insert(zipFileDiffEntries).values([
        {
          id: crypto.randomUUID(),
          zipFileId: zipId,
          projectVersion: 1,
          entryKey: added.filename,
          computedKind: "new",
          decisionKind: "new",
          ...added,
        },
        {
          id: crypto.randomUUID(),
          zipFileId: zipId,
          projectVersion: 1,
          entryKey: existingId,
          computedKind: "changed",
          decisionKind: "changed",
          filename: existing.filename,
          fileId: existingId,
          sourceSha: "replacement-digest",
          targetSha: existing.sha,
          bucketPath: `tmp/${zipId}/existing.pdf`,
        },
      ]);
    });
    const selected = { new: [], changed: [], deleted: [], renamed: [], unchanged: [existing] };
    const saved = await documents.mutations.setDiff(zipId, selected);
    expect(saved).toMatchObject({ new: [], excluded: [added], unchanged: [existing] });
    expect(await documents.mutations.getDiff(zipId)).toEqual(saved);
    await expect(
      documents.mutations.setDiff(zipId, { ...selected, unchanged: [] }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      documents.mutations.setDiff(zipId, {
        ...selected,
        new: [{ ...added, filename: "unknown.pdf" }],
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      documents.mutations.setDiff(zipId, { ...selected, new: [added, added] }),
    ).rejects.toMatchObject({ status: 422 });
    expect(await documents.mutations.setDiff(zipId, { ...selected, new: [added] })).toMatchObject({
      new: [added],
    });
  });

  test.skipIf(process.env.DMS_TEST_S3_ENDPOINT === undefined)(
    "keeps historical bytes immutable across project versions and reusable upload URLs",
    async () => {
      const projectId = crypto.randomUUID();
      const actor = crypto.randomUUID();
      projectIds.push(projectId);
      const request = {
        type: "document" as const,
        projectId,
        filename: "same.pdf",
        createNewVersion: false,
      };
      try {
        await database.query((query) =>
          query.insert(projects).values({ id: projectId, createdById: actor }),
        );
        const first = await documents.files.generateUploadUrl(request, 1);
        expect(
          (
            await fetch(first.uploadUrl, {
              method: "PUT",
              body: "%PDF-1.7\noriginal",
              headers: { "content-type": first.mimeType },
            })
          ).ok,
        ).toBeTrue();
        const original = await documents.files.confirmUpload(request, 1);
        await database.query((query) =>
          query.insert(projects).values({ id: projectId, projectVersion: 2, createdById: actor }),
        );
        const second = await documents.files.generateUploadUrl(request, 2);
        expect(
          (
            await fetch(second.uploadUrl, {
              method: "PUT",
              body: "%PDF-1.7\nreplacement",
              headers: { "content-type": second.mimeType },
            })
          ).ok,
        ).toBeTrue();
        const replacement = await documents.files.confirmUpload(request, 2);
        expect(original.bucketPath).not.toBe(replacement.bucketPath);
        expect(
          new TextDecoder().decode(
            (await documents.cleanStorage.download(original.bucketPath, 100)).bytes,
          ),
        ).toBe("%PDF-1.7\noriginal");
        expect(
          new TextDecoder().decode(
            (await documents.cleanStorage.download(replacement.bucketPath, 100)).bytes,
          ),
        ).toBe("%PDF-1.7\nreplacement");
        expect(
          (
            await fetch(first.uploadUrl, {
              method: "PUT",
              body: "%PDF-1.7\nlate overwrite",
              headers: { "content-type": first.mimeType },
            })
          ).ok,
        ).toBeTrue();
        expect(
          new TextDecoder().decode(
            (await documents.cleanStorage.download(original.bucketPath, 100)).bytes,
          ),
        ).toBe("%PDF-1.7\noriginal");
      } finally {
        for (const prefix of [`documents/${projectId}`, `uploads/documents/${projectId}`]) {
          for (const path of await documents.cleanStorage.list(prefix))
            await documents.cleanStorage.delete(path);
        }
      }
    },
  );

  test.each([1, 2])(
    "does not promote excluded new files when committing to version %i, including retry",
    async (targetVersion) => {
      const projectId = crypto.randomUUID();
      const zipId = crypto.randomUUID();
      const lockToken = crypto.randomUUID();
      projectIds.push(projectId);
      await database.query(async (query) => {
        await query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() });
        await query.insert(projectVersionLocks).values({
          id: crypto.randomUUID(),
          projectId,
          sourceVersion: 1,
          targetVersion,
          zipFileId: zipId,
          lockToken,
        });
        await query.insert(zipFiles).values({
          id: zipId,
          projectId,
          projectVersion: 1,
          filename: "excluded.zip",
          bucketPath: `zips/${zipId}`,
          sourceProjectVersion: 1,
          approvalStatus: "REQUIRES_APPROVAL",
          workflowStatus: "COMPLETED",
          isDeleted: false,
        });
        await query.insert(zipFileDiffEntries).values({
          id: crypto.randomUUID(),
          zipFileId: zipId,
          projectVersion: 1,
          entryKey: "new.pdf",
          computedKind: "new",
          decisionKind: "new",
          filename: "new.pdf",
          bucketPath: `tmp/${zipId}/new.pdf`,
          sha: new Bun.CryptoHasher("sha256").update("excluded document").digest("hex"),
        });
      });
      await documents.mutations.setDiff(zipId, {
        new: [],
        changed: [],
        deleted: [],
        renamed: [],
        unchanged: [],
      });
      const input = { sourceVersion: 1, targetVersion, lockToken, dryRun: false };
      expect(await documents.mutations.commitDiff(projectId, zipId, input)).toMatchObject({
        new: 0,
        changed: 0,
      });
      expect(await documents.mutations.commitDiff(projectId, zipId, input)).toMatchObject({
        new: 0,
        changed: 0,
      });
      expect(
        await database.query((query) =>
          query.select().from(files).where(eq(files.projectId, projectId)),
        ),
      ).toEqual([]);
      expect(await documents.mutations.getDiff(zipId)).toMatchObject({
        new: [],
        excluded: [{ filename: "new.pdf" }],
      });
    },
  );

  test.skipIf(process.env.DMS_TEST_S3_ENDPOINT === undefined)(
    "keeps promotion and failure status on the captured revision after a real version copy",
    async () => {
      const projectId = crypto.randomUUID();
      const fileId = crypto.randomUUID();
      const lockToken = crypto.randomUUID();
      const bucketPath = `documents/${projectId}/captured.pdf`;
      projectIds.push(projectId);
      const repository = new DrizzleDmsActivityRepository(documents.scope, documents.cleanStorage);
      try {
        await database.query(async (query) => {
          await query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() });
          await query.insert(projectVersionLocks).values({
            id: crypto.randomUUID(),
            projectId,
            sourceVersion: 1,
            targetVersion: 2,
            lockToken,
          });
          await query.insert(files).values({
            id: fileId,
            projectId,
            projectVersion: 1,
            type: "DOCUMENT",
            filename: "captured.pdf",
            bucketPath,
            mimeType: "application/pdf",
            workflowStatus: "RUNNING",
            isDeleted: false,
          });
        });
        await documents.cleanStorage.upload(
          bucketPath,
          new TextEncoder().encode("%PDF-1.7\ncaptured"),
          { contentType: "application/pdf" },
        );
        await documents.versioning.copyVersion({
          projectId,
          sourceVersion: 1,
          targetVersion: 2,
          lockToken,
          nodes: [{ id: fileId, nodeType: "file" }],
          dryRun: false,
        });
        await expect(
          documents.scanAndPromote.execute({ fileId, bucketPath, filename: "captured.pdf" }),
        ).rejects.toMatchObject({ status: 409 });
        await documents.scanAndPromote.execute({
          fileId,
          projectVersion: 1,
          bucketPath,
          filename: "captured.pdf",
        });
        expect((await documents.files.getFileRow(fileId, 1, true))?.workflowStatus).toBe(
          "COMPLETED",
        );
        expect((await documents.files.getFileRow(fileId, 2, true))?.workflowStatus).toBe("RUNNING");
        await repository.updateFileStatus({ fileId, projectVersion: 1, status: "FAILED" });
        expect((await documents.files.getFileRow(fileId, 1, true))?.workflowStatus).toBe("FAILED");
        expect((await documents.files.getFileRow(fileId, 2, true))?.workflowStatus).toBe("RUNNING");
        await expect(
          repository.updateFileStatus({ fileId, status: "FAILED" }),
        ).rejects.toMatchObject({ status: 409 });
      } finally {
        await documents.cleanStorage.delete(bucketPath);
      }
    },
  );

  test.skipIf(process.env.DMS_TEST_S3_ENDPOINT === undefined)(
    "retains published bytes after a failed database completion and recovers without quarantine",
    async () => {
      const projectId = crypto.randomUUID();
      const fileId = crypto.randomUUID();
      const bucketPath = `documents/${projectId}/promotion.pdf`;
      const bytes = new TextEncoder().encode("%PDF-1.7\npromotion retry");
      const constraint = `b03_promotion_${fileId.replaceAll("-", "")}`;
      projectIds.push(projectId);
      const quarantine = new S3Storage({
        ...documents.configuration.cleanStorage,
        bucket: "b03-quarantine",
      });
      const promotion = new ScanAndPromoteService(
        documents.scope,
        documents.files,
        documents.cleanStorage,
        quarantine,
        documents.scanner,
      );
      try {
        await database.query(async (query) => {
          await query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() });
          await query.insert(files).values({
            id: fileId,
            projectId,
            projectVersion: 1,
            type: "DOCUMENT",
            filename: "promotion.pdf",
            bucketPath,
            mimeType: "application/pdf",
            workflowStatus: "RUNNING",
            isDeleted: false,
          });
          await query.execute(
            sql.raw(
              `ALTER TABLE file ADD CONSTRAINT ${constraint} CHECK (id <> '${fileId}'::uuid OR workflow_status <> 'COMPLETED') NOT VALID`,
            ),
          );
        });
        await quarantine.upload(bucketPath, bytes, { contentType: "application/pdf" });
        const input = { fileId, projectVersion: 1, bucketPath, filename: "promotion.pdf" };
        await expect(promotion.execute(input)).rejects.toBeInstanceOf(Error);
        expect((await documents.cleanStorage.download(bucketPath, 100)).bytes).toEqual(bytes);
        expect((await documents.files.getFileRow(fileId, 1, true))?.workflowStatus).toBe("RUNNING");
        expect(await quarantine.exists(bucketPath)).toBeTrue();
        await database.query((query) =>
          query.execute(sql.raw(`ALTER TABLE file DROP CONSTRAINT ${constraint}`)),
        );
        await quarantine.delete(bucketPath);
        await promotion.execute(input);
        expect((await documents.files.getFileRow(fileId, 1, true))?.workflowStatus).toBe(
          "COMPLETED",
        );
        expect((await documents.cleanStorage.download(bucketPath, 100)).bytes).toEqual(bytes);
      } finally {
        await database.query((query) =>
          query.execute(sql.raw(`ALTER TABLE file DROP CONSTRAINT IF EXISTS ${constraint}`)),
        );
        if (await documents.cleanStorage.exists(bucketPath))
          await documents.cleanStorage.delete(bucketPath);
        if (await quarantine.exists(bucketPath)) await quarantine.delete(bucketPath);
        quarantine.close();
      }
    },
  );

  test.skipIf(process.env.DMS_TEST_S3_ENDPOINT === undefined)(
    "recovers the exact backend ZIP receipt after a lost reply and source cleanup",
    async () => {
      const projectId = crypto.randomUUID();
      projectIds.push(projectId);
      const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
      await writer.add(
        "plan.pdf",
        new Uint8ArrayReader(new TextEncoder().encode("%PDF-1.7\nplan")),
        { level: 0 },
      );
      const content = await writer.close();
      const peer = createDocumentFilesService(documents);
      const input = {
        projectId,
        projectVersion: 1,
        fileType: "zip" as const,
        filename: "planunterlagen.zip",
        content,
      };
      try {
        await database.query((query) =>
          query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() }),
        );
        const first = await peer.uploadProjectFile(input);
        expect(first).not.toBeNull();
        const retry = await peer.uploadProjectFile(input);
        expect(retry?.id).toBe(first!.id);
        await database.query((query) =>
          query
            .update(zipFiles)
            .set({ workflowStatus: "COMPLETED", approvalStatus: "REQUIRES_APPROVAL" })
            .where(eq(zipFiles.id, first!.id)),
        );
        await documents.cleanStorage.delete(first!.bucketPath);
        expect((await peer.uploadProjectFile(input))?.id).toBe(first!.id);
        expect(await peer.getZipFile(first!.id, 1)).toMatchObject({
          id: first!.id,
          projectId,
          workflowStatus: "COMPLETED",
          approvalStatus: "REQUIRES_APPROVAL",
        });
        await expect(peer.getZipFile(first!.id, 2)).rejects.toMatchObject({ status: 404 });
        expect(
          await database.query((query) =>
            query.select().from(zipFiles).where(eq(zipFiles.projectId, projectId)),
          ),
        ).toHaveLength(1);
      } finally {
        for (const path of await documents.cleanStorage.list(`zips/${projectId}`))
          await documents.cleanStorage.delete(path);
      }
    },
  );

  test.skipIf(process.env.DMS_TEST_S3_ENDPOINT === undefined)(
    "keeps reintroduced EWMS bytes separate from history and checks retry content",
    async () => {
      const projectId = crypto.randomUUID();
      const zipId = crypto.randomUUID();
      const oldId = crypto.randomUUID();
      projectIds.push(projectId);
      const filename = "E1234.pdf";
      const oldPath = `ewms/${projectId}/files/v1/${filename}`;
      const incoming = `tmp/${projectId}/${zipId}/${filename}`;
      const original = new TextEncoder().encode("%PDF-1.7\nold");
      const replacement = new TextEncoder().encode("%PDF-1.7\nnew");
      const repository = new DrizzleDmsActivityRepository(documents.scope, documents.cleanStorage);
      const input = {
        projectId,
        projectVersion: 2,
        zipFileId: zipId,
        fileId: null,
        filename,
        bucketPath: incoming,
        entryFileType: "ewms_document" as const,
      };
      try {
        await database.query(async (query) => {
          await query.insert(projects).values(
            [1, 2].map((projectVersion) => ({
              id: projectId,
              projectVersion,
              createdById: crypto.randomUUID(),
            })),
          );
          await query.insert(zipFiles).values({
            id: zipId,
            projectId,
            projectVersion: 2,
            filename: "ewms.zip",
            bucketPath: `test/${zipId}.zip`,
            workflowStatus: "RUNNING",
            type: "EWMS_ZIP",
            isDeleted: false,
          });
          await query.insert(files).values({
            id: oldId,
            projectId,
            projectVersion: 1,
            type: "EWMS_DOCUMENT",
            filename,
            bucketPath: oldPath,
            mimeType: "application/pdf",
            isDeleted: false,
          });
        });
        await documents.cleanStorage.upload(oldPath, original, { contentType: "application/pdf" });
        await documents.cleanStorage.upload(incoming, replacement, {
          contentType: "application/pdf",
          metadata: { sha256: new Bun.CryptoHasher("sha256").update(replacement).digest("hex") },
        });
        const id = await repository.ingestFile(input);
        const [current] = await database.query((query) =>
          query.select().from(files).where(eq(files.id, id)),
        );
        expect((await documents.cleanStorage.download(oldPath, 100)).bytes).toEqual(original);
        expect((await documents.cleanStorage.download(current!.bucketPath, 100)).bytes).toEqual(
          replacement,
        );
        expect(await repository.ingestFile(input)).toBe(id);
        await documents.cleanStorage.upload(incoming, original, {
          overwrite: true,
          contentType: "application/pdf",
          metadata: { sha256: new Bun.CryptoHasher("sha256").update(original).digest("hex") },
        });
        await expect(repository.ingestFile(input)).rejects.toMatchObject({ status: 409 });
        expect((await documents.cleanStorage.download(current!.bucketPath, 100)).bytes).toEqual(
          replacement,
        );
      } finally {
        for (const prefix of [`ewms/${projectId}`, `tmp/${projectId}`])
          for (const path of await documents.cleanStorage.list(prefix))
            await documents.cleanStorage.delete(path);
      }
    },
  );

  test.skipIf(process.env.DMS_TEST_TEMPORAL_ADDRESS === undefined)(
    "recovers a lost ZIP start response and binds cancellation to the admitted native run",
    async () => {
      const address = process.env.DMS_TEST_TEMPORAL_ADDRESS!;
      const namespace = process.env.DMS_TEST_TEMPORAL_NAMESPACE!;
      const connection = await Connection.connect({ address });
      const workflow = new Client({ connection, namespace }).workflow;
      const nativeCommands = new DocumentTemporalCommandsService({
        temporalHost: address,
        temporalNamespace: namespace,
      });
      const start = nativeCommands.startFileProcessing.bind(nativeCommands);
      let loseResponse = true;
      nativeCommands.startFileProcessing = async (input) => {
        const result = await start(input);
        if (loseResponse) {
          loseResponse = false;
          throw new Error("lost successful start response");
        }
        return result;
      };
      const nativeDocuments = new DocumentRuntime(
        database,
        documents.configuration,
        nativeCommands,
      );
      const projectId = crypto.randomUUID();
      const firstId = crypto.randomUUID();
      const laterId = crypto.randomUUID();
      projectIds.push(projectId);
      const executions: Array<{ workflowId: string; runId: string }> = [];
      try {
        await database.query(async (query) => {
          await query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() });
          await query.insert(zipFiles).values(
            [firstId, laterId].map((id) => ({
              id,
              projectId,
              filename: `${id}.zip`,
              bucketPath: `test/${id}.zip`,
              workflowStatus: "PENDING" as const,
              isDeleted: false,
            })),
          );
        });
        await expect(
          nativeDocuments.mutations.startFileProcessing({ projectId, fileId: firstId }),
        ).rejects.toMatchObject({ status: 500 });
        const [admitted] = await database.query((query) =>
          query.select().from(zipFiles).where(eq(zipFiles.id, firstId)),
        );
        expect(admitted?.workflowStatus).toBe("RUNNING");
        expect(admitted?.workflowId).toBeString();
        expect(admitted?.runId).toBeNull();
        const first = await nativeDocuments.mutations.startFileProcessing({
          projectId,
          fileId: firstId,
        });
        executions.push(first);
        expect(first.workflowId).toBe(admitted!.workflowId!);
        await expect(
          nativeDocuments.mutations.startFileProcessing({ projectId, fileId: laterId }),
        ).rejects.toMatchObject({ status: 409 });
        await workflow
          .getHandle(first.workflowId, first.runId)
          .terminate("B03 finish first attempt");
        await database.query((query) =>
          query
            .update(zipFiles)
            .set({ workflowStatus: "COMPLETED" })
            .where(eq(zipFiles.id, firstId)),
        );
        expect(
          await nativeDocuments.mutations.startFileProcessing({ projectId, fileId: firstId }),
        ).toMatchObject({ workflowId: first.workflowId, runId: first.runId });
        const later = await nativeDocuments.mutations.startFileProcessing({
          projectId,
          fileId: laterId,
        });
        executions.push(later);
        await nativeDocuments.mutations.cancelProcessing(firstId);
        expect(
          (await workflow.getHandle(later.workflowId, later.runId).describe()).status.name,
        ).toBe("RUNNING");
        await nativeDocuments.mutations.cancelProcessing(laterId);
        const history = await workflow.getHandle(later.workflowId, later.runId).fetchHistory();
        expect(
          history.events?.some(
            (event) => event.workflowExecutionCancelRequestedEventAttributes != null,
          ),
        ).toBeTrue();
        await workflow
          .getHandle(later.workflowId, later.runId)
          .terminate("B03 finish later attempt");
        await database.query((query) =>
          query
            .update(zipFiles)
            .set({ workflowStatus: "COMPLETED" })
            .where(eq(zipFiles.id, laterId)),
        );
        await database.query((query) =>
          query.update(zipFiles).set({ workflowStatus: "FAILED" }).where(eq(zipFiles.id, firstId)),
        );
        const repeated = await nativeDocuments.mutations.startFileProcessing({
          projectId,
          fileId: firstId,
        });
        executions.push(repeated);
        expect(repeated.workflowId).not.toBe(first.workflowId);
        expect(repeated.runId).not.toBe(first.runId);
      } finally {
        for (const execution of executions) {
          const handle = workflow.getHandle(execution.workflowId, execution.runId);
          if ((await handle.describe()).status.name === "RUNNING")
            await handle.terminate("B03 test cleanup");
        }
        await nativeDocuments.close();
        await nativeCommands.close();
        await connection.close();
      }
    },
    20_000,
  );
});
