import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { coreSchema } from "@spark-workflow/core/schema";
import { files } from "@spark-workflow/core/documents/schema";
import {
  projectNodesProvider,
  projectsProvider,
  usecasesProvider,
} from "@spark-workflow/core/projects/runtime";
import { createFeatureHttp } from "@spark-workflow/http-host";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { eq, inArray } from "drizzle-orm";

import { supplementaryRequests } from "../../../supplementary_requests_service/src/db/schema.ts";
import { documents, documentTypes, formalCompletenessSchema } from "../../src/db/schema.ts";
import { feature } from "../../src/manifest.ts";
import { createDocumentRoutes } from "../../src/routes/documents.ts";

const databaseUrl = process.env.FCS_MUTATION_DATABASE_URL;
const schema = { ...coreSchema, ...formalCompletenessSchema, supplementaryRequests };
process.env.AUTH_MODE = "disabled";

describe.skipIf(databaseUrl === undefined)("formal document list complete-dataset filters", () => {
  const projectId = crypto.randomUUID();
  const typeId = crypto.randomUUID();
  const fileIds = Array.from({ length: 55 }, () => crypto.randomUUID()).sort().reverse();
  const assignedFileId = fileIds[54]!;
  const versioned = {
    projectId: crypto.randomUUID(),
    aiTypeId: crypto.randomUUID(),
    humanTypeId: crypto.randomUUID(),
    overriddenFileId: crypto.randomUUID(),
    aiOnlyFileId: crypto.randomUUID(),
  };
  let database: PostgresResourceRuntime<typeof schema>;
  let app: { handle(request: Request): Promise<Response> };

  beforeAll(async () => {
    database = createPostgresRuntime({
      url: databaseUrl!, schema,
      pool: { maxConnections: 2, idleTimeoutSeconds: 30, connectionTimeoutSeconds: 5, maxLifetimeSeconds: 120, closeTimeoutSeconds: 5 },
    });
    const nodes = await projectNodesProvider.make({ postgres: database });
    const services = new Map<unknown, unknown>([
      [projectsProvider.resource, await projectsProvider.make({ postgres: database, nodes })],
      [usecasesProvider.resource, await usecasesProvider.make({ postgres: database })],
    ]);
    const http = createFeatureHttp({
      get: async (resource) => (services.get(resource) ?? database) as never,
      ready: async () => undefined,
      close: async () => undefined,
    }).for(feature);
    app = createDocumentRoutes(http);
    await database.query(async (query) => {
      await query.insert(coreSchema.projects).values({ id: projectId, createdById: crypto.randomUUID() });
      await query.insert(files).values(fileIds.map((id) => ({
        id, projectId, type: "DOCUMENT" as const, filename: `${id}.pdf`,
        bucketPath: `documents/${projectId}/${id}.pdf`, mimeType: "application/pdf", isDeleted: false,
        createdAt: new Date("2026-09-01T08:00:00.000Z"),
      })));
      await query.insert(documentTypes).values({ id: typeId, projectId, name: "Hidden Übergrößenplanung", description: "Required plan", origin: "custom" });
      await query.insert(documents).values({ id: crypto.randomUUID(), projectId, fileId: assignedFileId, documentName: `${assignedFileId}.pdf`, humanRequiredDocumentTypeId: typeId });
      await query.insert(supplementaryRequests).values({ id: crypto.randomUUID(), projectId, title: "Please provide this plan", priority: "must", sourceType: "tableOfContents", sourceItemId: assignedFileId });

      const createdById = crypto.randomUUID();
      await query.insert(coreSchema.projects).values([1, 2].map((projectVersion) => ({ id: versioned.projectId, projectVersion, createdById })));
      await query.insert(files).values([
        { id: versioned.overriddenFileId, projectVersion: 1, createdAt: new Date("2026-09-01T08:00:00.000Z") },
        { id: versioned.overriddenFileId, projectVersion: 2, createdAt: new Date("2026-09-01T08:00:00.000Z") },
        { id: versioned.aiOnlyFileId, projectVersion: 2, createdAt: new Date("2026-09-02T08:00:00.000Z") },
      ].map((file) => ({
        ...file, projectId: versioned.projectId, type: "DOCUMENT" as const, filename: `${file.id}.pdf`,
        bucketPath: `documents/${versioned.projectId}/v${file.projectVersion}/${file.id}.pdf`, mimeType: "application/pdf", isDeleted: false,
      })));
      await query.insert(documentTypes).values([1, 2].flatMap((projectVersion) => [
        { id: versioned.aiTypeId, projectVersion, projectId: versioned.projectId, name: "Lageplan", description: "AI suggestion", origin: "custom" },
        { id: versioned.humanTypeId, projectVersion, projectId: versioned.projectId, name: "Bauwerksverzeichnis", description: "Human decision", origin: "custom" },
      ]));
      await query.insert(documents).values([
        { fileId: versioned.overriddenFileId, projectVersion: 1, aiSuggestedRequiredDocumentTypeId: versioned.aiTypeId, confidence: 0.41 },
        { fileId: versioned.overriddenFileId, projectVersion: 2, aiSuggestedRequiredDocumentTypeId: versioned.aiTypeId, humanRequiredDocumentTypeId: versioned.humanTypeId, confidence: 0.83 },
        { fileId: versioned.aiOnlyFileId, projectVersion: 2, aiSuggestedRequiredDocumentTypeId: versioned.aiTypeId, confidence: null },
      ].map((document) => ({ ...document, id: crypto.randomUUID(), projectId: versioned.projectId, documentName: `${document.fileId}.pdf` })));
    });
  });

  afterAll(async () => {
    if (!database) return;
    const projectIds = [projectId, versioned.projectId];
    await database.query(async (query) => {
      await query.delete(supplementaryRequests).where(eq(supplementaryRequests.projectId, projectId));
      await query.delete(documents).where(inArray(documents.projectId, projectIds));
      await query.delete(documentTypes).where(inArray(documentTypes.projectId, projectIds));
      await query.delete(files).where(inArray(files.projectId, projectIds));
      await query.delete(coreSchema.projects).where(inArray(coreSchema.projects.id, projectIds));
    });
    await database.close();
  });

  const list = async (filter: string) => {
    const response = await app.handle(new Request(`http://formal.test/${projectId}/documents?projectVersion=1&limit=50&${filter}`));
    expect(response.status).toBe(200);
    return await response.json() as Array<{ id: string; status: string }>;
  };

  test("searches persisted document-type names before the first page", async () => {
    expect((await list("search=Hidden")).map(({ id }) => id)).toEqual([assignedFileId]);
    expect((await list("search=Uebergroessen")).map(({ id }) => id)).toEqual([assignedFileId]);
    expect((await list("search=ubergrossen")).map(({ id }) => id)).toEqual([assignedFileId]);
  });

  test("applies type and request status over persisted assignments rather than loaded files", async () => {
    expect(await list(`documentTypeId=${typeId}&status=requested`)).toEqual([
      expect.objectContaining({ id: assignedFileId, status: "requested" }),
    ]);
    expect(await list(`documentTypeId=${typeId}&status=unassigned`)).toEqual([]);
  });

  test("requested membership takes precedence over an absent assignment", async () => {
    const requestedId = crypto.randomUUID();
    const unassignedFileId = fileIds[0]!;
    await database.query((query) => query.insert(supplementaryRequests).values({ id: requestedId, projectId, title: "Missing assignment", priority: "must", sourceType: "requiredDocuments", sourceItemId: unassignedFileId }));
    try {
      expect(await list("status=requested")).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: unassignedFileId, status: "requested" }),
      ]));
    } finally {
      await database.query((query) => query.delete(supplementaryRequests).where(eq(supplementaryRequests.id, requestedId)));
    }
    expect(await list("status=unassigned")).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: unassignedFileId, status: "unassigned" }),
    ]));
  });

  test("pages every matching file without treating an absent assignment as an absent file", async () => {
    const first = await list("offset=0");
    const second = await list("offset=50");
    expect(first.map(({ id }) => id)).toEqual(fileIds.slice(0, 50));
    expect(second.map(({ id }) => id)).toEqual(fileIds.slice(50));
  });

  test("summarizes assigned document types beyond the first page for requirement readiness", async () => {
    const response = await app.handle(new Request(`http://formal.test/${projectId}/document-summary?projectVersion=1`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ assignedTypeIds: [typeId] });
  });

  const versionedList = async (query: string) => {
    const response = await app.handle(new Request(`http://formal.test/${versioned.projectId}/documents${query}`));
    expect(response.status).toBe(200);
    return await response.json();
  };

  test("selects the current project version and prefers the human decision over the AI suggestion", async () => {
    const overridden = {
      id: versioned.overriddenFileId,
      documentTypeId: versioned.humanTypeId,
      documentTypeName: "Bauwerksverzeichnis",
      humanRequiredDocumentTypeId: versioned.humanTypeId,
      aiSuggestedRequiredDocumentTypeId: versioned.aiTypeId,
      confidence: 0.83,
      status: "assigned",
    };
    const aiOnly = {
      id: versioned.aiOnlyFileId,
      documentTypeId: versioned.aiTypeId,
      documentTypeName: "Lageplan",
      humanRequiredDocumentTypeId: null,
      aiSuggestedRequiredDocumentTypeId: versioned.aiTypeId,
      confidence: null,
      status: "assigned",
    };
    expect(await versionedList("")).toEqual([
      expect.objectContaining(aiOnly),
      expect.objectContaining(overridden),
    ]);
    expect(await versionedList("?projectVersion=2")).toEqual(await versionedList(""));
    expect(await versionedList(`?documentTypeId=${versioned.aiTypeId}`)).toEqual([
      expect.objectContaining(aiOnly),
    ]);
  });

  test("keeps an earlier project version's own assignment", async () => {
    expect(await versionedList("?projectVersion=1")).toEqual([
      expect.objectContaining({
        id: versioned.overriddenFileId,
        documentTypeId: versioned.aiTypeId,
        humanRequiredDocumentTypeId: null,
        aiSuggestedRequiredDocumentTypeId: versioned.aiTypeId,
        confidence: 0.41,
      }),
    ]);
  });
});
