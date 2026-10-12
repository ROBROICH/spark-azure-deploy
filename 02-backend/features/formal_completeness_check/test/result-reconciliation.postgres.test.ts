import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { files } from "@spark-workflow/core/documents/schema";
import {
  projectNodesProvider,
  projectsProvider,
  usecasesProvider,
} from "@spark-workflow/core/projects/runtime";
import type { ProjectsService } from "@spark-workflow/core/projects/resource";
import { projectLogicSchema, projects, projectVersionLocks } from "@spark-workflow/core/projects/schema";
import { createUsecasesService } from "@spark-workflow/core/usecases/resource";
import { createFeatureHttp, type HttpJson } from "@spark-workflow/http-host";
import { bindNodeRuntime, createNodeVersionService } from "@spark-workflow/node-crud";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { and, eq, inArray } from "drizzle-orm";

import {
  categories,
  documentHistory,
  documents,
  documentTypes,
  formalCompletenessSchema,
  projectTemplateVersions,
  tocNoteHistory,
  tocNotes,
  tocStatuses,
} from "../src/db/schema.ts";
import { createRoutes } from "../src/index.ts";
import { feature } from "../src/manifest.ts";
import {
  FormalCompletenessNodes,
  formalCompletenessDescriptor,
} from "../src/node/descriptor.ts";
import { createTocRoutes } from "../src/routes/toc.ts";
import { getFormalResults, processFormalResults, processTocResults } from "../src/results.ts";
import { getTemplateDocumentTypes } from "../src/versioning.ts";

process.env.AUTH_MODE = "disabled";

const databaseUrl = process.env.FCS_MUTATION_DATABASE_URL;
const schema = { ...projectLogicSchema, ...formalCompletenessSchema, files, auditLogs };

describe.skipIf(databaseUrl === undefined)("formal completeness persisted result reconciliation", () => {
  let database: PostgresResourceRuntime<typeof schema>;
  let projectService: ProjectsService;
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
    const nodes = await projectNodesProvider.make({ postgres: database });
    projectService = await projectsProvider.make({ postgres: database, nodes });
  });

  afterAll(async () => {
    if (!database) return;
    await database.query(async (query) => {
      await query.delete(documents).where(inArray(documents.projectId, projectIds));
      await query.delete(documentTypes).where(inArray(documentTypes.projectId, projectIds));
      for (const table of Object.values(formalCompletenessSchema)) {
        if (table !== documents && table !== documentTypes) {
          await query.delete(table).where(inArray(table.projectId, projectIds));
        }
      }
      await query.delete(files).where(inArray(files.projectId, projectIds));
      await query.delete(auditLogs).where(inArray(auditLogs.projectId, projectIds));
      await query
        .delete(projectVersionLocks)
        .where(inArray(projectVersionLocks.projectId, projectIds));
      await query.delete(projects).where(inArray(projects.id, projectIds));
    });
    await database.close();
  });

  async function fixture() {
    const projectId = crypto.randomUUID();
    projectIds.push(projectId);
    await database.query((query) =>
      query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() }),
    );
    return { projectId, scope: database.scope(formalCompletenessSchema) };
  }

  const resultFile = (projectId: string, payload: HttpJson) => ({
    readResultFile: async () => ({
      projectId,
      projectVersion: 1,
      bytes: new TextEncoder().encode(JSON.stringify(payload)),
    }),
  });

  test("formal redelivery keeps human decisions, identities, tombstones and its original outcome", async () => {
    const { projectId, scope } = await fixture();
    const fileId = crypto.randomUUID();
    const extractionId = crypto.randomUUID();
    const resultId = crypto.randomUUID();
    const humanTypeId = crypto.randomUUID();
    const unassigned = {
      documentId: fileId,
      documentExtractionId: extractionId,
      documentName: "Plan.pdf",
      reasoning: "No match",
      confidence: 0.2,
    };
    const original = resultFile(projectId, { matchedDocumentTypes: [], unassignedDocuments: [unassigned] });
    const deliver = (documentFile: ReturnType<typeof resultFile>) =>
      processFormalResults(scope, documentFile, projectService, projectId, 1, resultId);
    const projectDocuments = () =>
      database.query((query) =>
        query.select().from(documents).where(eq(documents.projectId, projectId)),
      );
    const [first, concurrent] = await Promise.all([deliver(original), deliver(original)]);
    expect(concurrent).toEqual(first);
    const [initial] = await projectDocuments();
    await database.query(async (query) => {
      await query.insert(documentTypes).values({
        id: humanTypeId,
        projectId,
        name: "Human selection",
        description: "",
        origin: "custom",
      });
      await query
        .update(documents)
        .set({ humanRequiredDocumentTypeId: humanTypeId, isDeleted: true })
        .where(eq(documents.id, initial!.id));
    });
    const history = () =>
      database.query((query) =>
        query.select().from(documentHistory).where(eq(documentHistory.projectId, projectId)),
      );
    const beforeHistory = await history();
    expect(await deliver(original)).toEqual(first);
    const [after] = await projectDocuments();
    expect(after).toMatchObject({
      id: initial!.id,
      humanRequiredDocumentTypeId: humanTypeId,
      isDeleted: true,
      contentExtractionId: extractionId,
    });
    expect(await history()).toEqual(beforeHistory);
    expect(
      await database.query((query) =>
        query.select().from(auditLogs).where(eq(auditLogs.projectId, projectId)),
      ),
    ).toHaveLength(1);
    await deliver(
      resultFile(projectId, {
        matchedDocumentTypes: [],
        unassignedDocuments: [{ ...unassigned, reasoning: "New analysis" }],
      }),
    );
    const [updated] = await projectDocuments();
    expect(updated).toMatchObject({
      id: initial!.id,
      humanRequiredDocumentTypeId: humanTypeId,
      isDeleted: true,
      reasoning: "New analysis",
    });
    await deliver(original);
    expect((await projectDocuments())[0]?.reasoning).toBe("New analysis");
  });

  test("formal results never rewrite a custom document type with the same name", async () => {
    const { projectId, scope } = await fixture();
    const customTypeId = crypto.randomUUID();
    await database.query((query) =>
      query.insert(documentTypes).values({
        id: customTypeId,
        projectId,
        name: "Plan",
        description: "Custom description",
        origin: "custom",
      }),
    );
    await processFormalResults(
      scope,
      resultFile(projectId, {
        matchedDocumentTypes: [
          {
            requiredDocumentType: {
              category: null,
              documentTypeName: "Plan",
              documentTypeDescription: "AI description",
            },
            assignedDocuments: [
              {
                documentId: crypto.randomUUID(),
                documentExtractionId: crypto.randomUUID(),
                documentName: "Plan.pdf",
                reasoning: "Matches",
                confidence: 0.9,
              },
            ],
            confidence: 0.9,
          },
        ],
        unassignedDocuments: [],
      }),
      projectService,
      projectId,
      1,
      crypto.randomUUID(),
    );
    expect(
      await database.query((query) =>
        query
          .select({ origin: documentTypes.origin, description: documentTypes.description })
          .from(documentTypes)
          .where(eq(documentTypes.id, customTypeId)),
      ),
    ).toEqual([{ origin: "custom", description: "Custom description" }]);
  });

  test("TOC replacement and no-TOC preserve manual notes and resolved identities without old-result resurrection", async () => {
    const { projectId, scope } = await fixture();
    const manualId = crypto.randomUUID();
    await database.query((query) =>
      query
        .insert(tocNotes)
        .values({ id: manualId, projectId, content: "Manual note", isResolved: true }),
    );
    const successId = crypto.randomUUID();
    const success = resultFile(projectId, {
      inhaltsverzeichnisExtractionOutput: { status: "success" },
      inhaltsverzeichnisMatchingOutput: {
        matchedDocumentTypes: [
          { requiredDocumentType: { documentTypeName: "Missing plan" }, assignedDocuments: [] },
        ],
      },
    });
    const deliver = (documentFile: ReturnType<typeof resultFile>, fileId: string) =>
      processTocResults(scope, documentFile, projectService, projectId, 1, fileId);
    const notes = () =>
      database.query((query) =>
        query.select().from(tocNotes).where(eq(tocNotes.projectId, projectId)),
      );
    const first = await deliver(success, successId);
    const initial = await notes();
    expect(initial.find(({ id }) => id === manualId)).toMatchObject({
      content: "Manual note",
      isResolved: true,
    });
    const generated = initial.find(({ id }) => id !== manualId)!;
    await database.query((query) =>
      query.update(tocNotes).set({ isResolved: true }).where(eq(tocNotes.id, generated.id)),
    );
    expect(await deliver(success, successId)).toEqual(first);
    expect((await deliver(success, crypto.randomUUID())).notesCreated).toBe(0);
    const emptyId = crypto.randomUUID();
    const empty = resultFile(projectId, {
      inhaltsverzeichnisExtractionOutput: { status: "no_inhaltsverzeichnis_found" },
      inhaltsverzeichnisMatchingOutput: { matchedDocumentTypes: [] },
    });
    const emptyOutcome = await deliver(empty, emptyId);
    expect(await deliver(empty, emptyId)).toEqual(emptyOutcome);
    const after = await notes();
    expect(after.find(({ id }) => id === manualId)).toMatchObject({
      isDeleted: false,
      isResolved: true,
    });
    expect(after.find(({ id }) => id === generated.id)).toMatchObject({
      isDeleted: false,
      isOutdated: true,
      isResolved: true,
    });
    await deliver(success, successId);
    expect(
      (
        await database.query((query) =>
          query.select().from(tocStatuses).where(eq(tocStatuses.projectId, projectId)),
        )
      )[0]?.status,
    ).toBe("no_inhaltsverzeichnis_found");
    expect(
      await database.query((query) =>
        query.select().from(auditLogs).where(eq(auditLogs.projectId, projectId)),
      ),
    ).toHaveLength(3);
  });

  test.each(["no_inhaltsverzeichnis_found", "success"] as const)(
    "TOC notes return after %s without reviving human tombstones",
    async (absentStatus) => {
      const { projectId, scope } = await fixture();
      const services = new Map<unknown, unknown>([
        [projectsProvider.resource, projectService],
        [usecasesProvider.resource, await usecasesProvider.make({ postgres: database })],
      ]);
      const app = createTocRoutes(
        createFeatureHttp({
          get: async (resource) => (services.get(resource) ?? database) as never,
          ready: async () => undefined,
          close: async () => undefined,
        }).for(feature),
      );
      const present = resultFile(projectId, {
        inhaltsverzeichnisExtractionOutput: { status: "success" },
        inhaltsverzeichnisMatchingOutput: {
          matchedDocumentTypes: ["Missing plan", "Dismissed plan"].map((documentTypeName) => ({
            requiredDocumentType: { documentTypeName },
            assignedDocuments: [],
          })),
        },
      });
      const absent = resultFile(projectId, {
        inhaltsverzeichnisExtractionOutput: { status: absentStatus },
        inhaltsverzeichnisMatchingOutput: { matchedDocumentTypes: [] },
      });
      const deliver = (documentFile: ReturnType<typeof resultFile>, fileId: string) =>
        processTocResults(scope, documentFile, projectService, projectId, 1, fileId);
      const noteRows = () =>
        database.query((query) =>
          query.select().from(tocNotes).where(eq(tocNotes.projectId, projectId)),
        );
      const historyRows = () =>
        database.query((query) =>
          query.select().from(tocNoteHistory).where(eq(tocNoteHistory.projectId, projectId)),
        );
      const auditRows = () =>
        database.query((query) =>
          query.select().from(auditLogs).where(eq(auditLogs.projectId, projectId)),
        );
      const visibleNotes = async () => {
        const response = await app.handle(
          new Request(`http://formal.test/${projectId}/toc-notes`),
        );
        expect(response.status).toBe(200);
        return (await response.json()).notes as Array<{ id: string; isResolved: boolean }>;
      };
      await deliver(present, crypto.randomUUID());
      const initial = await noteRows();
      const missing = initial.find(({ content }) => content === "Missing plan")!;
      const dismissed = initial.find(({ content }) => content === "Dismissed plan")!;
      const manualId = crypto.randomUUID();
      await database.query(async (query) => {
        await query.update(tocNotes).set({ isResolved: true }).where(eq(tocNotes.id, missing.id));
        await query
          .update(tocNotes)
          .set({ isDeleted: true, isOutdated: true })
          .where(eq(tocNotes.id, dismissed.id));
        await query.insert(tocNotes).values({
          id: manualId,
          projectId,
          content: "Manual note",
          isResolved: true,
          isOutdated: true,
        });
      });
      for (let cycle = 0; cycle < 2; cycle += 1) {
        const absentId = crypto.randomUUID();
        await deliver(absent, absentId);
        expect(await visibleNotes()).toEqual([
          expect.objectContaining({ id: manualId, content: "Manual note", isResolved: true }),
        ]);
        const presentId = crypto.randomUUID();
        const restored = await deliver(present, presentId);
        const visible = await visibleNotes();
        expect(visible.map(({ id }) => id).sort()).toEqual([manualId, missing.id].sort());
        expect(visible.find(({ id }) => id === missing.id)?.isResolved).toBe(true);
        const beforeReplay = await noteRows();
        expect(beforeReplay.find(({ id }) => id === dismissed.id)?.isDeleted).toBe(true);
        const historyBeforeReplay = await historyRows();
        const auditBeforeReplay = await auditRows();
        expect(await deliver(present, presentId)).toEqual(restored);
        await deliver(absent, absentId);
        expect(await noteRows()).toEqual(beforeReplay);
        expect(await historyRows()).toEqual(historyBeforeReplay);
        expect(await auditRows()).toEqual(auditBeforeReplay);
      }
    },
  );

  test("copy-version rejects provenance overrides while retaining trusted source provenance", async () => {
    const { projectId, scope } = await fixture();
    await processTocResults(
      scope,
      resultFile(projectId, {
        inhaltsverzeichnisExtractionOutput: { status: "success" },
        inhaltsverzeichnisMatchingOutput: {
          matchedDocumentTypes: [
            {
              requiredDocumentType: { documentTypeName: "Generated plan" },
              assignedDocuments: [],
            },
          ],
        },
      }),
      projectService,
      projectId,
      1,
      crypto.randomUUID(),
    );
    const [generated] = await database.query((query) =>
      query.select().from(tocNotes).where(eq(tocNotes.projectId, projectId)),
    );
    const manualId = crypto.randomUUID();
    const lockToken = crypto.randomUUID();
    await database.query(async (query) => {
      await query.update(tocNotes).set({ isResolved: true }).where(eq(tocNotes.id, generated!.id));
      await query
        .insert(tocNotes)
        .values({ id: manualId, projectId, content: "Manual note", isResolved: true });
      await query.insert(projectVersionLocks).values({
        id: crypto.randomUUID(),
        projectId,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken,
      });
    });
    const nodes = bindNodeRuntime(formalCompletenessDescriptor, {
      persistence: scope,
      versionPeer: projectService,
    });
    const services = new Map<unknown, unknown>([
      [projectsProvider.resource, projectService],
      [usecasesProvider.resource, await usecasesProvider.make({ postgres: database })],
      [FormalCompletenessNodes, nodes],
    ]);
    const app = createRoutes(
      createFeatureHttp({
        get: async (resource) => (services.get(resource) ?? database) as never,
        ready: async () => undefined,
        close: async () => undefined,
      }).for(feature),
    );
    const versions = createNodeVersionService(nodes);
    const historyRows = () =>
      database.query((query) =>
        query.select().from(tocNoteHistory).where(eq(tocNoteHistory.projectId, projectId)),
      );
    const auditRows = () =>
      database.query((query) =>
        query.select().from(auditLogs).where(eq(auditLogs.projectId, projectId)),
      );
    const versionTwoNotes = () =>
      database.query((query) =>
        query
          .select()
          .from(tocNotes)
          .where(and(eq(tocNotes.projectId, projectId), eq(tocNotes.projectVersion, 2))),
      );
    const beforeHistory = await historyRows();
    const beforeAudit = await auditRows();
    for (const dryRun of [true, false]) {
      for (const node of [
        {
          nodeType: "table_of_content_notes",
          id: manualId,
          overrides: { generatedKey: "f".repeat(64) },
        },
        {
          nodeType: "table_of_content_notes",
          id: generated!.id,
          overrides: { generatedKey: null },
        },
      ]) {
        const input = { sourceVersion: 1, targetVersion: 2, lockToken, dryRun, nodes: [node] };
        const response = await app.handle(
          new Request(`http://formal.test/${projectId}/copy-version`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          }),
        );
        expect(response.status).toBe(422);
        await expect(versions.copyVersion({ projectId, ...input })).rejects.toMatchObject({
          status: 422,
        });
      }
    }
    expect(await versionTwoNotes()).toEqual([]);
    expect(await historyRows()).toEqual(beforeHistory);
    expect(await auditRows()).toEqual(beforeAudit);
    const input = {
      projectId,
      sourceVersion: 1,
      targetVersion: 2,
      lockToken,
      nodes: [manualId, generated!.id].map((id) => ({ nodeType: "table_of_content_notes", id })),
    };
    expect(await versions.copyVersion({ ...input, dryRun: true })).toEqual({
      dryRun: true,
      copied: 2,
    });
    expect(await versions.copyVersion({ ...input, dryRun: false })).toEqual({
      dryRun: false,
      copied: 2,
    });
    const copied = await versionTwoNotes();
    expect(copied.find(({ id }) => id === generated!.id)).toMatchObject({
      generatedKey: generated!.generatedKey,
      isResolved: true,
    });
    expect(copied.find(({ id }) => id === manualId)).toMatchObject({
      generatedKey: null,
      isResolved: true,
    });
    await database.query(async (query) => {
      await query
        .insert(projects)
        .values({ id: projectId, projectVersion: 2, createdById: crypto.randomUUID() });
      await query.delete(projectVersionLocks).where(eq(projectVersionLocks.projectId, projectId));
    });
    await processTocResults(
      scope,
      {
        readResultFile: async () => ({
          projectId,
          projectVersion: 2,
          bytes: new TextEncoder().encode(
            JSON.stringify({
              inhaltsverzeichnisExtractionOutput: { status: "no_inhaltsverzeichnis_found" },
              inhaltsverzeichnisMatchingOutput: { matchedDocumentTypes: [] },
            }),
          ),
        }),
      },
      projectService,
      projectId,
      2,
      crypto.randomUUID(),
    );
    const response = await app.handle(new Request(`http://formal.test/${projectId}/toc-notes`));
    expect(response.status).toBe(200);
    expect((await response.json()).notes).toEqual([
      expect.objectContaining({ id: manualId, content: "Manual note", isResolved: true }),
    ]);
  });

  test("results require active assignment and active DOCUMENT source in the same version", async () => {
    const { projectId, scope } = await fixture();
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
    await database.query(async (query) => {
      await query.insert(files).values(
        ids.slice(0, 4).map((id, index) => ({
          id,
          projectId,
          projectVersion: index === 3 ? 2 : 1,
          filename: `${id}.pdf`,
          bucketPath: `test/${id}`,
          mimeType: "application/pdf",
          type: index === 2 ? ("CONTENT_EXTRACTION" as const) : ("DOCUMENT" as const),
          isDeleted: index === 1,
        })),
      );
      await query.insert(documents).values(
        ids.map((fileId) => ({
          id: crypto.randomUUID(),
          projectId,
          fileId,
          documentName: `${fileId}.pdf`,
        })),
      );
      await query.insert(documents).values({
        id: crypto.randomUUID(),
        projectId,
        documentName: "Deleted assignment",
        isDeleted: true,
      });
    });
    expect(
      (await getFormalResults(scope, projectId, 1)).unassignedDocuments.map(
        ({ documentId }) => documentId,
      ),
    ).toEqual([ids[0]!]);
    await database.query((query) =>
      query.update(documents).set({ isDeleted: true }).where(eq(documents.fileId, ids[0]!)),
    );
    expect((await getFormalResults(scope, projectId, 1)).unassignedDocuments).toEqual([]);
  });

  test("the database rejects category references across project boundaries", async () => {
    const first = await fixture();
    const second = await fixture();
    const categoryId = crypto.randomUUID();
    await database.query((query) =>
      query
        .insert(categories)
        .values({ id: categoryId, projectId: second.projectId, name: "Other project" }),
    );
    await expect(
      database.query((query) =>
        query.insert(documentTypes).values({
          id: crypto.randomUUID(),
          projectId: first.projectId,
          name: "Plan",
          description: "",
          categoryId,
          origin: "system",
        }),
      ),
    ).rejects.toThrow();
  });

  test("an active null template registration falls back without changing stored registration", async () => {
    const { projectId, scope } = await fixture();
    const typeId = crypto.randomUUID();
    const usecases = createUsecasesService(database.scope(projectLogicSchema));
    (
      await usecases.create({
        projekttyp: { id: typeId, name: `Template ${typeId}` },
        gesetzesgrundlage: { topics: [], stateNormGroups: {}, topicStateGroups: {} },
        dokumente: {
          categories: [
            {
              id: crypto.randomUUID(),
              category: "Plans",
              document_types: [
                {
                  id: crypto.randomUUID(),
                  name: "Plan",
                  description: "Required",
                  expected_count: 1,
                },
              ],
            },
          ],
        },
        beschluss: {
          nodes: [
            {
              id: crypto.randomUUID(),
              parent_vae_node_id: null,
              title: "Decision",
              text: "",
              topic: null,
              order: 1,
              is_hidden: false,
              can_add_child: true,
            },
          ],
        },
      })
    ).unwrap();
    try {
      const registrationId = crypto.randomUUID();
      await database.query((query) =>
        query
          .insert(projectTemplateVersions)
          .values({ id: registrationId, projectId, version: 1, projectTypeId: null }),
      );
      const templateTypes = () =>
        getTemplateDocumentTypes(scope, projectId, 1, async () => typeId, usecases);
      const first = await templateTypes();
      expect(first.map(({ documentTypeName }) => documentTypeName)).toEqual(["Plan"]);
      expect(await templateTypes()).toEqual(first);
      expect(
        await database.query((query) =>
          query
            .select({
              id: projectTemplateVersions.id,
              projectTypeId: projectTemplateVersions.projectTypeId,
            })
            .from(projectTemplateVersions)
            .where(
              and(
                eq(projectTemplateVersions.projectId, projectId),
                eq(projectTemplateVersions.isDeleted, false),
              ),
            ),
        ),
      ).toEqual([{ id: registrationId, projectTypeId: null }]);
    } finally {
      (await usecases.delete(typeId)).unwrap();
    }
  });
});
