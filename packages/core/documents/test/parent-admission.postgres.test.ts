import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import {
  createNodeVersionService,
  executeNodeMutation,
  listNodeSummaries,
  transactNodeMutation,
  trustedServiceAuthorization,
  type NodeRuntime,
} from "@spark-workflow/node-crud";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { and, eq, inArray } from "drizzle-orm";
import { coreSchema } from "../../src/schema.ts";
import {
  projectLogicSchema,
  projects,
  projectHistory,
  projectVersionLocks,
  topics,
  topicHistory,
  subtopics,
  subtopicHistory,
} from "../../projects/src/db/schema.ts";
import { projectNodesProvider } from "../../projects/src/runtime.ts";
import { decodeNodeSummaries } from "../../projects/src/temporal/copy-plan.ts";
import { fileTopics, fileTopicHistory, files, fileHistory } from "../src/db/schema.ts";
import { parseDocumentConfiguration } from "../src/env.ts";
import { DocumentRuntime } from "../src/runtime.ts";
import { DocumentTemporalCommandsService } from "../src/temporal/commands.ts";

const databaseUrl = process.env.DMS_MUTATION_DATABASE_URL;
const schema = { ...coreSchema, auditLogs };

describe.skipIf(databaseUrl === undefined)("DMS topic assignment admission", () => {
  let database: PostgresResourceRuntime<typeof schema>;
  let projectRuntime: NodeRuntime<typeof projectLogicSchema>;
  let commands: DocumentTemporalCommandsService;
  let documents: DocumentRuntime;
  const projectIds: string[] = [];
  beforeAll(async () => {
    database = createPostgresRuntime({
      url: databaseUrl!,
      schema,
      pool: {
        maxConnections: 4,
        idleTimeoutSeconds: 5,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 60,
        closeTimeoutSeconds: 5,
      },
    });
    projectRuntime = await projectNodesProvider.make({ postgres: database });
    commands = new DocumentTemporalCommandsService({
      temporalHost: "127.0.0.1:1",
      temporalNamespace: "dms-parent-admission",
    });
    documents = new DocumentRuntime(
      database,
      parseDocumentConfiguration({
        ENV: "local",
        CLAMAV_ENABLED: "false",
        CLAMAV_BASE_URL: "http://127.0.0.1:1",
        BUCKET_NAME: "dms-parent-admission",
        S3_ACCESS_KEY_ID: "synthetic-local",
        S3_SECRET_ACCESS_KEY: "synthetic-local",
        S3_ENDPOINT_URL: "http://127.0.0.1:1",
        S3_EXTERNAL_URL: "http://127.0.0.1:1",
        S3_REGION: "eu-west-1",
        MAX_OBJECT_SIZE_MB: "1",
      }),
      commands,
    );
    await database.ready();
  });
  afterAll(async () => {
    await database.query(async (query) => {
      for (const table of [
        fileTopics,
        fileTopicHistory,
        files,
        fileHistory,
        projectVersionLocks,
        subtopics,
        subtopicHistory,
        topics,
        topicHistory,
        auditLogs,
      ])
        await query.delete(table).where(inArray(table.projectId, projectIds));
      await query.delete(projects).where(inArray(projects.id, projectIds));
      await query.delete(projectHistory).where(inArray(projectHistory.id, projectIds));
    });
    await documents.close();
    await commands.close();
    await database.close();
  });

  async function fixture() {
    const projectId = crypto.randomUUID(),
      topicId = crypto.randomUUID(),
      subtopicId = crypto.randomUUID(),
      fileId = crypto.randomUUID();
    projectIds.push(projectId);
    await database.query((query) =>
      query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() }),
    );
    (
      await transactNodeMutation(projectRuntime, trustedServiceAuthorization, projectId, 1, {
        inserts: [
          {
            nodeType: "topic",
            id: topicId,
            payload: { name: "Topic", showInMvp: true, showInEwm: true, showInBeschluss: true },
          },
          {
            nodeType: "subtopic",
            id: subtopicId,
            payload: {
              topicId,
              name: "Subtopic",
              showInMvp: true,
              showInEwm: true,
              showInBeschluss: true,
            },
          },
        ],
      })
    ).unwrap();
    await database.query((query) =>
      query.insert(files).values({
        id: fileId,
        projectId,
        type: "DOCUMENT",
        isDeleted: false,
        filename: "document.pdf",
        mimeType: "application/pdf",
        bucketPath: `documents/${projectId}/document.pdf`,
      }),
    );
    return { projectId, topicId, subtopicId, fileId };
  }

  for (const kind of ["topic", "subtopic"] as const) {
    test(`rejects a generic ${kind} assignment after parent deletion`, async () => {
      const row = await fixture(),
        targetId = kind === "topic" ? row.topicId : row.subtopicId;
      (
        await transactNodeMutation(projectRuntime, trustedServiceAuthorization, row.projectId, 1, {
          deletes:
            kind === "topic"
              ? [
                  { nodeType: "subtopic", id: row.subtopicId },
                  { nodeType: kind, id: targetId },
                ]
              : [{ nodeType: kind, id: targetId }],
        })
      ).unwrap();
      const result = await transactNodeMutation(
        documents.node,
        trustedServiceAuthorization,
        row.projectId,
        1,
        {
          inserts: [
            {
              nodeType: "file_topic",
              payload: {
                fileId: row.fileId,
                [kind === "topic" ? "topicId" : "subtopicId"]: targetId,
              },
            },
          ],
        },
      );
      expect(result.status).toBe("error");
      expect(
        await database.query((query) =>
          query.select().from(fileTopics).where(eq(fileTopics.projectId, row.projectId)),
        ),
      ).toHaveLength(0);
      const summaries = [
        ...(await listNodeSummaries(projectRuntime, row.projectId, 1)).map((node) => ({
          ...node,
          _service: "projectLogicService",
        })),
        ...(await listNodeSummaries(documents.node, row.projectId, 1)).map((node) => ({
          ...node,
          _service: "documentManagementService",
        })),
      ];
      expect(() => decodeNodeSummaries(summaries)).not.toThrow();
      const survivingTopicId = crypto.randomUUID(),
        linkId = crypto.randomUUID();
      (
        await transactNodeMutation(projectRuntime, trustedServiceAuthorization, row.projectId, 1, {
          inserts: [
            {
              nodeType: "topic",
              id: survivingTopicId,
              payload: {
                name: "Surviving",
                showInMvp: true,
                showInEwm: true,
                showInBeschluss: true,
              },
            },
          ],
        })
      ).unwrap();
      (
        await transactNodeMutation(documents.node, trustedServiceAuthorization, row.projectId, 1, {
          inserts: [
            {
              nodeType: "file_topic",
              id: linkId,
              payload: { fileId: row.fileId, topicId: survivingTopicId },
            },
          ],
        })
      ).unwrap();
      const updated = await transactNodeMutation(
        documents.node,
        trustedServiceAuthorization,
        row.projectId,
        1,
        {
          updates: [
            {
              nodeType: "file_topic",
              id: linkId,
              payload:
                kind === "topic" ? { topicId: targetId } : { topicId: null, subtopicId: targetId },
            },
          ],
        },
      );
      expect(updated.status).toBe("error");
      expect(
        (
          await database.query((query) =>
            query.select().from(fileTopics).where(eq(fileTopics.id, linkId)),
          )
        )[0]?.topicId,
      ).toBe(survivingTopicId);
    });

    test(`serializes ${kind} assignment before concurrent deletion`, async () => {
      const row = await fixture(),
        targetId = kind === "topic" ? row.topicId : row.subtopicId;
      const inserted = Promise.withResolvers<void>(),
        release = Promise.withResolvers<void>();
      const write = database.transact(async () => {
        (
          await executeNodeMutation(documents.node, trustedServiceAuthorization, row.projectId, 1, {
            inserts: [
              {
                nodeType: "file_topic",
                payload: {
                  fileId: row.fileId,
                  [kind === "topic" ? "topicId" : "subtopicId"]: targetId,
                },
              },
            ],
          })
        ).unwrap();
        inserted.resolve();
        await release.promise;
      });
      await inserted.promise;
      const deletion = transactNodeMutation(
        projectRuntime,
        trustedServiceAuthorization,
        row.projectId,
        1,
        {
          deletes:
            kind === "topic"
              ? [
                  { nodeType: "subtopic", id: row.subtopicId },
                  { nodeType: kind, id: targetId },
                ]
              : [{ nodeType: kind, id: targetId }],
        },
      );
      release.resolve();
      await write;
      expect((await deletion).status).toBe("error");
      expect(
        await database.query((query) =>
          query.select().from(fileTopics).where(eq(fileTopics.projectId, row.projectId)),
        ),
      ).toHaveLength(1);
    });

    test(`rejects foreign ${kind} inserts and updates`, async () => {
      const row = await fixture(),
        foreign = await fixture(),
        targetId = kind === "topic" ? foreign.topicId : foreign.subtopicId;
      const linkId = crypto.randomUUID(),
        field = kind === "topic" ? "topicId" : "subtopicId";
      const inserted = await transactNodeMutation(
        documents.node,
        trustedServiceAuthorization,
        row.projectId,
        1,
        {
          inserts: [{ nodeType: "file_topic", payload: { fileId: row.fileId, [field]: targetId } }],
        },
      );
      expect(inserted.status).toBe("error");
      (
        await transactNodeMutation(documents.node, trustedServiceAuthorization, row.projectId, 1, {
          inserts: [
            {
              nodeType: "file_topic",
              id: linkId,
              payload: {
                fileId: row.fileId,
                [field]: kind === "topic" ? row.topicId : row.subtopicId,
              },
            },
          ],
        })
      ).unwrap();
      const updated = await transactNodeMutation(
        documents.node,
        trustedServiceAuthorization,
        row.projectId,
        1,
        { updates: [{ nodeType: "file_topic", id: linkId, payload: { [field]: targetId } }] },
      );
      expect(updated.status).toBe("error");
      expect(
        (
          await database.query((query) =>
            query.select().from(fileTopics).where(eq(fileTopics.id, linkId)),
          )
        )[0]?.[field],
      ).toBe(kind === "topic" ? row.topicId : row.subtopicId);
    });
  }

  test("custom assignment rejects deleted and foreign topics while preserving prior links", async () => {
    const row = await fixture(),
      foreign = await fixture(),
      deleted = await fixture();
    await documents.mutations.updateFile(row.fileId, 1, { topics: [row.topicId] });
    (
      await transactNodeMutation(
        projectRuntime,
        trustedServiceAuthorization,
        deleted.projectId,
        1,
        {
          deletes: [
            { nodeType: "subtopic", id: deleted.subtopicId },
            { nodeType: "topic", id: deleted.topicId },
          ],
        },
      )
    ).unwrap();
    for (const topicId of [foreign.topicId, deleted.topicId])
      await expect(
        documents.mutations.updateFile(row.fileId, 1, { topics: [topicId] }),
      ).rejects.toMatchObject({ status: 422 });
    expect((await documents.files.getFile(row.fileId, 1)).topics).toEqual([row.topicId]);
  });

  test("custom assignment rejects a topic deleted from its captured project version", async () => {
    const row = await fixture();
    (
      await transactNodeMutation(projectRuntime, trustedServiceAuthorization, row.projectId, 1, {
        deletes: [
          { nodeType: "subtopic", id: row.subtopicId },
          { nodeType: "topic", id: row.topicId },
        ],
      })
    ).unwrap();
    await expect(
      documents.mutations.updateFile(row.fileId, 1, { topics: [row.topicId] }),
    ).rejects.toMatchObject({ status: 422 });
    expect((await documents.files.getFile(row.fileId, 1)).topics).toEqual([]);
  });
  test("rejects generic and custom writes after the captured project version advances", async () => {
    const row = await fixture();
    await database.query((query) =>
      query
        .insert(projects)
        .values({ id: row.projectId, projectVersion: 2, createdById: crypto.randomUUID() }),
    );
    expect(
      (
        await transactNodeMutation(documents.node, trustedServiceAuthorization, row.projectId, 1, {
          inserts: [
            { nodeType: "file_topic", payload: { fileId: row.fileId, topicId: row.topicId } },
          ],
        })
      ).status,
    ).toBe("error");
    await expect(
      documents.mutations.updateFile(row.fileId, 1, { topics: [row.topicId] }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await database.query((query) =>
        query.select().from(fileTopics).where(eq(fileTopics.projectId, row.projectId)),
      ),
    ).toHaveLength(0);
  });

  test.each(["topic", "subtopic"] as const)(
    "validates %s parents in copy preflight, actual writes and stored-target retries",
    async (kind) => {
      const row = await fixture(),
        linkId = crypto.randomUUID(),
        lockToken = crypto.randomUUID();
      const field = kind === "topic" ? "topicId" : "subtopicId",
        targetId = kind === "topic" ? row.topicId : row.subtopicId;
      (
        await transactNodeMutation(documents.node, trustedServiceAuthorization, row.projectId, 1, {
          inserts: [
            {
              nodeType: "file_topic",
              id: linkId,
              payload: { fileId: row.fileId, [field]: targetId },
            },
          ],
        })
      ).unwrap();
      await database.query((query) =>
        query.insert(projectVersionLocks).values({
          id: crypto.randomUUID(),
          projectId: row.projectId,
          sourceVersion: 1,
          targetVersion: 2,
          lockToken,
        }),
      );
      const copy = {
        projectId: row.projectId,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken,
        nodes: [
          { nodeType: "file", id: row.fileId },
          { nodeType: "file_topic", id: linkId },
        ],
      };
      expect(await documents.versioning.copyVersion({ ...copy, dryRun: true })).toMatchObject({
        copied: 2,
      });
      await expect(
        documents.versioning.copyVersion({ ...copy, dryRun: false }),
      ).rejects.toMatchObject({ status: 422 });
      expect(
        await database.query((query) =>
          query
            .select()
            .from(files)
            .where(and(eq(files.projectId, row.projectId), eq(files.projectVersion, 2))),
        ),
      ).toHaveLength(0);
      await database.query((query) =>
        query
          .insert(projects)
          .values({ id: row.projectId, projectVersion: 2, createdById: crypto.randomUUID() }),
      );
      await createNodeVersionService(projectRuntime).copyVersion({
        ...copy,
        nodes: [
          { nodeType: "topic", id: row.topicId },
          { nodeType: "subtopic", id: row.subtopicId },
        ],
        dryRun: false,
      });
      expect(await documents.versioning.copyVersion({ ...copy, dryRun: false })).toMatchObject({
        copied: 2,
      });
      expect(await documents.versioning.copyVersion({ ...copy, dryRun: false })).toMatchObject({
        copied: 2,
      });
      const table = kind === "topic" ? topics : subtopics;
      await database.query((query) =>
        query
          .update(table)
          .set({ isDeleted: true })
          .where(and(eq(table.id, targetId), eq(table.projectVersion, 2))),
      );
      await expect(
        documents.versioning.copyVersion({ ...copy, dryRun: true }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        documents.versioning.copyVersion({ ...copy, dryRun: false }),
      ).rejects.toMatchObject({ status: 422 });
    },
  );
  test("custom assignments block parent deletion until explicitly cleared", async () => {
    const row = await fixture();
    await documents.mutations.updateFile(row.fileId, 1, { topics: [row.topicId] });
    const deletion = {
      deletes: [
        { nodeType: "subtopic", id: row.subtopicId },
        { nodeType: "topic", id: row.topicId },
      ],
    };
    expect(
      (
        await transactNodeMutation(
          projectRuntime,
          trustedServiceAuthorization,
          row.projectId,
          1,
          deletion,
        )
      ).status,
    ).toBe("error");
    await documents.mutations.updateFile(row.fileId, 1, { topics: [] });
    (
      await transactNodeMutation(
        projectRuntime,
        trustedServiceAuthorization,
        row.projectId,
        1,
        deletion,
      )
    ).unwrap();
  });

  test("custom assignment rechecks parents after waiting for a concurrent deletion", async () => {
    const row = await fixture();
    const deleted = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    const deletion = database.transact(async () => {
      (
        await executeNodeMutation(projectRuntime, trustedServiceAuthorization, row.projectId, 1, {
          deletes: [
            { nodeType: "subtopic", id: row.subtopicId },
            { nodeType: "topic", id: row.topicId },
          ],
        })
      ).unwrap();
      deleted.resolve();
      await release.promise;
    });
    await deleted.promise;
    const assignment = documents.mutations.updateFile(row.fileId, 1, { topics: [row.topicId] });
    release.resolve();
    await deletion;
    await expect(assignment).rejects.toMatchObject({ status: 422 });
    expect((await documents.files.getFile(row.fileId, 1)).topics).toEqual([]);
  });

  test("copy preserves a valid target-only remap and rejects a foreign parent override", async () => {
    const row = await fixture(),
      foreign = await fixture(),
      linkId = crypto.randomUUID(),
      remappedTopicId = crypto.randomUUID(),
      lockToken = crypto.randomUUID();
    (
      await transactNodeMutation(documents.node, trustedServiceAuthorization, row.projectId, 1, {
        inserts: [
          {
            nodeType: "file_topic",
            id: linkId,
            payload: { fileId: row.fileId, topicId: row.topicId },
          },
        ],
      })
    ).unwrap();
    await database.query(async (query) => {
      await query.insert(projectVersionLocks).values({
        id: crypto.randomUUID(),
        projectId: row.projectId,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken,
      });
      await query
        .insert(projects)
        .values({ id: row.projectId, projectVersion: 2, createdById: crypto.randomUUID() });
      await query.insert(topics).values({
        id: remappedTopicId,
        projectId: row.projectId,
        projectVersion: 2,
        name: "Target-only topic",
        isDeleted: false,
        showInMvp: true,
        showInEwm: true,
        showInBeschluss: true,
      });
    });
    const copy = { projectId: row.projectId, sourceVersion: 1, targetVersion: 2, lockToken };
    await expect(
      documents.versioning.copyVersion({
        ...copy,
        nodes: [
          { nodeType: "file", id: row.fileId },
          { nodeType: "file_topic", id: linkId, overrides: { topicId: foreign.topicId } },
        ],
        dryRun: true,
      }),
    ).rejects.toMatchObject({ status: 422 });
    const nodes = [
      { nodeType: "file", id: row.fileId },
      { nodeType: "file_topic", id: linkId, overrides: { topicId: remappedTopicId } },
    ];
    expect(await documents.versioning.copyVersion({ ...copy, nodes, dryRun: true })).toMatchObject({
      copied: 2,
    });
    expect(await documents.versioning.copyVersion({ ...copy, nodes, dryRun: false })).toMatchObject(
      { copied: 2 },
    );
    expect(
      (
        await database.query((query) =>
          query
            .select()
            .from(fileTopics)
            .where(and(eq(fileTopics.id, linkId), eq(fileTopics.projectVersion, 2))),
        )
      )[0]?.topicId,
    ).toBe(remappedTopicId);
  });
});
