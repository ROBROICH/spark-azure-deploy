import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { Documents } from "@spark-workflow/core/documents/resource";
import {
  projectNodesProvider,
  projectsProvider,
  usecasesProvider,
} from "@spark-workflow/core/projects/runtime";
import {
  projectHistory,
  projectLogicSchema,
  projects,
  projectTypes,
  projectVersionLocks,
} from "@spark-workflow/core/projects/schema";
import { createUsecasesService } from "@spark-workflow/core/usecases/resource";
import { createFeatureHttp, createHttpHost, type HttpJson } from "@spark-workflow/http-host";
import {
  createPostgresRuntime,
  PostgreSQL,
  type PostgresResourceRuntime,
} from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provideValue } from "@spark-workflow/resource";
import type { ResourceRuntime } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import { useStrictAuthentication } from "@spark-workflow/test-support/strict-auth";
import { eq, inArray } from "drizzle-orm";

import {
  categories,
  documents,
  documentTypes,
  formalCompletenessSchema,
  resultReceipts,
} from "../src/db/schema.ts";
import { createRoutes, feature } from "../src/index.ts";

process.env.EVLOG_SILENT = "0";

const databaseUrl = process.env.FCS_MUTATION_DATABASE_URL;
const describeDatabaseTests = databaseUrl === undefined ? describe.skip : describe;
const schema = { ...projectLogicSchema, ...formalCompletenessSchema, auditLogs };
const actorUserId = "5b000000-0000-4000-8000-000000000001";

const repeatedFileId = crypto.randomUUID();
const results = {
  formal: { matchedDocumentTypes: [], unassignedDocuments: [] },
  toc: {
    inhaltsverzeichnisExtractionOutput: { status: "success" },
    inhaltsverzeichnisMatchingOutput: {
      matchedDocumentTypes: [
        { requiredDocumentType: { documentTypeName: "Lageplan" }, assignedDocuments: [] },
      ],
    },
  },
  emptyToc: {
    inhaltsverzeichnisExtractionOutput: { status: "no_inhaltsverzeichnis_found" },
    inhaltsverzeichnisMatchingOutput: { matchedDocumentTypes: [] },
  },
  rollback: {
    matchedDocumentTypes: [],
    unassignedDocuments: [
      { documentId: repeatedFileId, documentExtractionId: repeatedFileId, documentName: "first.pdf", reasoning: "Unassigned", confidence: 1 },
      { documentId: repeatedFileId, documentExtractionId: repeatedFileId, documentName: "second.pdf", reasoning: "Unassigned", confidence: 1 },
    ],
  },
} as const;

describeDatabaseTests("formal completeness writes leave one attributed audit row", () => {
  const projectIds = Object.fromEntries(
    ["notes", "formal", "toc", "emptyToc", "initialization", "requirements", "rollback", "stale", "deleted", "locked", "mismatch"].map((key) => [key, crypto.randomUUID()]),
  ) as Record<"notes" | "initialization" | "requirements" | "stale" | "deleted" | "locked" | "mismatch" | keyof typeof results, string>;
  const resultFiles = new Map<string, { projectId: string; payload: (typeof results)[keyof typeof results] }>(
    Object.entries(results).map(([key, payload]) => [
      crypto.randomUUID(),
      { projectId: projectIds[key as keyof typeof results], payload },
    ]),
  );
  const projectTypeId = crypto.randomUUID();
  let database: PostgresResourceRuntime<typeof schema>;
  let resources: ResourceRuntime<
    typeof PostgreSQL | (typeof feature.needs)[keyof typeof feature.needs]
  >;
  let app: { handle(request: Request): Promise<Response> };
  let authentication: Awaited<ReturnType<typeof useStrictAuthentication>>;

  beforeAll(async () => {
    authentication = await useStrictAuthentication([]);
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
    await database.ready();
    await database.query((query) =>
      query
        .insert(projects)
        .values(Object.values(projectIds).map((id) => ({ id, createdById: actorUserId }))),
    );
    await database.query((query) => query.insert(categories).values({
      id: crypto.randomUUID(),
      projectId: projectIds.requirements,
      name: "Benutzerdefiniert",
    }));
    (
      await createUsecasesService(database.scope(projectLogicSchema)).create({
        projekttyp: { id: projectTypeId, name: `Audit initialization ${projectTypeId}` },
        gesetzesgrundlage: { topics: [], stateNormGroups: {}, topicStateGroups: {} },
        dokumente: {
          categories: [{
            id: crypto.randomUUID(),
            category: "Antragsunterlagen",
            document_types: [{
              id: crypto.randomUUID(),
              name: "Lageplan",
              description: "Lage des Vorhabens",
              expected_count: 1,
            }],
          }],
        },
        beschluss: {
          nodes: [{
            id: crypto.randomUUID(),
            parent_vae_node_id: null,
            title: "Beschluss",
            text: "",
            topic: null,
            order: 1,
            is_hidden: false,
            can_add_child: true,
          }],
        },
      })
    ).unwrap();
    await database.query(async (query) => {
      await query.insert(projectTypes).values({ id: projectTypeId, name: `Audit ${projectTypeId}` });
      await query.update(projects).set({ projectTypeId }).where(inArray(projects.id, Object.values(projectIds)));
      await query.insert(projects).values({ id: projectIds.stale, projectVersion: 2, createdById: actorUserId, projectTypeId });
      await query.update(projects).set({ isDeleted: true }).where(eq(projects.id, projectIds.deleted));
      await query.update(projects).set({ projectTypeId: null }).where(eq(projects.id, projectIds.mismatch));
      await query.insert(projectVersionLocks).values({ id: crypto.randomUUID(), projectId: projectIds.locked, sourceVersion: 1, targetVersion: 2, lockToken: crypto.randomUUID() });
    });
    resources = makeEffectResourceRuntime(
      composeFeatures([
        feature,
        defineFeature({
          id: "formal-completeness-audit-platform",
          needs: {},
          providers: [
            provideValue(PostgreSQL, database),
            projectNodesProvider,
            projectsProvider,
            usecasesProvider,
            provideValue(Documents, {
              async readResultFile(fileId: string) {
                const file = resultFiles.get(fileId)!;
                return {
                  projectId: file.projectId,
                  projectVersion: 1,
                  bytes: new TextEncoder().encode(JSON.stringify(file.payload)),
                };
              },
            }),
          ] as const,
          tables: {},
        }),
      ] as const),
    );
    app = createHttpHost("formal-completeness-audit-test").use(
      createRoutes(createFeatureHttp(resources).for(feature)),
    );
  });

  afterAll(async () => {
    authentication.stop();
    mock.restore();
    const ids = Object.values(projectIds);
    await database.query(async (query) => {
      await query.delete(projectVersionLocks).where(inArray(projectVersionLocks.projectId, ids));
      await query.delete(documents).where(inArray(documents.projectId, ids));
      await query.delete(documentTypes).where(inArray(documentTypes.projectId, ids));
      for (const table of Object.values(formalCompletenessSchema).filter((table) => table !== documentTypes)) {
        await query.delete(table).where(inArray(table.projectId, ids));
      }
      await query.delete(auditLogs).where(inArray(auditLogs.projectId, ids));
      await query.delete(projects).where(inArray(projects.id, ids));
      await query.delete(projectHistory).where(inArray(projectHistory.id, ids));
      await query.delete(projectTypes).where(eq(projectTypes.id, projectTypeId));
    });
    (await createUsecasesService(database.scope(projectLogicSchema)).delete(projectTypeId)).unwrap();
    await resources.close();
    await database.close();
  });

  const send = async (path: string, body?: HttpJson, method = "POST") => {
    const init: RequestInit = {
      method,
      headers: {
        "content-type": "application/json",
        ...(await authentication.userToken(actorUserId, ["service"])),
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    return app.handle(new Request(`http://localhost${path}`, init));
  };

  const auditRows = (projectId: string) =>
    database.query((query) =>
      query
        .select({
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          changeType: auditLogs.changeType,
          actionType: auditLogs.actionType,
          actorUserId: auditLogs.actorUserId,
        })
        .from(auditLogs)
        .where(eq(auditLogs.projectId, projectId))
        .orderBy(auditLogs.timestamp, auditLogs.id),
    );

  test("requirements initialization records one attributed project action after persistence", async () => {
    const projectId = projectIds.initialization;
    const response = await send(
      `/${projectId}/required-document-types/initialize?projectVersion=1`,
      { projectTypeId },
    );

    expect(response.status).toBe(200);
    expect(
      await database.query((query) =>
        query.select({ name: documentTypes.name }).from(documentTypes)
          .where(eq(documentTypes.projectId, projectId)),
      ),
    ).toEqual([{ name: "Lageplan" }]);
    expect(await auditRows(projectId)).toEqual([{
      entityType: "project",
      entityId: projectId,
      changeType: "action",
      actionType: "formal_completeness_requirements_initialized",
      actorUserId,
    }]);
  });

  test("TOC note create records one create row per note", async () => {
    const response = await send(`/${projectIds.notes}/toc-notes`, [{ content: "Lageplan" }]);

    expect(response.status).toBe(201);
    const [note] = (await response.json()) as { id: string }[];
    expect(await auditRows(projectIds.notes)).toEqual([
      {
        entityType: "table_of_content_notes",
        entityId: note!.id,
        changeType: "create",
        actionType: null,
        actorUserId,
      },
    ]);
  });

  test("requirements mutations audit once and the removed broad batch route cannot write", async () => {
    const projectId = projectIds.requirements;
    const createdResponse = await send(`/${projectId}/required-document-types`, { documentName: "Survey" });
    expect(createdResponse.status).toBe(201);
    const { documentTypeId } = await createdResponse.json() as { documentTypeId: string };
    expect((await send(`/${projectId}/required-document-types`, { documentName: "Survey" })).status).toBe(409);
    expect((await send(`/${projectId}/required-document-types/${documentTypeId}`, { isResolved: true }, "PATCH")).status).toBe(200);
    expect((await send(`/${projectId}/update?projectVersion=1`, {
      updates: [{ nodeType: "document_type", id: documentTypeId, payload: { isResolved: false } }],
    })).status).toBe(404);
    expect((await send(`/${projectId}/required-document-types/${documentTypeId}`, undefined, "DELETE")).status).toBe(200);
    expect(await auditRows(projectId)).toEqual(
      ["create", "update", "delete"].map((changeType) => ({
        entityType: "document_type", entityId: documentTypeId, changeType, actionType: null, actorUserId,
      })),
    );
  });

  for (const key of ["stale", "deleted", "locked"] as const) {
    test(`initialization rejects a ${key} original project version without mutations`, async () => {
      const projectId = projectIds[key];
      const response = await send(`/${projectId}/required-document-types/initialize?projectVersion=1`, { projectTypeId });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await database.query((query) => query.select({ id: documentTypes.id }).from(documentTypes).where(eq(documentTypes.projectId, projectId)))).toEqual([]);
      expect(await auditRows(projectId)).toEqual([]);
    });
  }

  test("initialization rejects a project type that differs from the project's own", async () => {
    const projectId = projectIds.mismatch;
    const response = await send(`/${projectId}/required-document-types/initialize?projectVersion=1`, { projectTypeId });
    expect(response.status).toBe(409);
    expect(await database.query((query) => query.select({ id: documentTypes.id }).from(documentTypes).where(eq(documentTypes.projectId, projectId)))).toEqual([]);
    expect(await auditRows(projectId)).toEqual([]);
  });

  test("failed result persistence rolls back both data and its success audit", async () => {
    const projectId = projectIds.rollback;
    const [fileId] = [...resultFiles].find(([, file]) => file.projectId === projectId)!;
    const response = await send(`/${projectId}/results?projectVersion=1`, { fileId });
    expect(response.status).toBe(409);
    expect(await database.query((query) => query.select({ id: documents.id }).from(documents).where(eq(documents.projectId, projectId)))).toEqual([]);
    expect(await auditRows(projectId)).toEqual([]);
    expect(await database.query((query) => query.select().from(resultReceipts).where(eq(resultReceipts.projectId, projectId)))).toEqual([]);
  });

  for (const [key, path, actionType] of [
    ["formal", "results", "formal_completeness_results_processed"],
    ["toc", "toc-notes/results", "formal_completeness_toc_results_processed"],
    ["emptyToc", "toc-notes/results", "formal_completeness_toc_results_processed"],
  ] as const) {
    test(`${key} result processing records one project action`, async () => {
      const [fileId] = [...resultFiles].find(([, file]) => file.projectId === projectIds[key])!;
      const response = await send(`/${projectIds[key]}/${path}?projectVersion=1`, { fileId });

      expect(response.status).toBe(200);
      expect(await auditRows(projectIds[key])).toEqual([
        {
          entityType: "project",
          entityId: projectIds[key],
          changeType: "action",
          actionType,
          actorUserId,
        },
      ]);
    });
  }
});
