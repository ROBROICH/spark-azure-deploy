import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import { Documents } from "@spark-workflow/core/documents/resource";
import { Projects, type ProjectsService } from "@spark-workflow/core/projects/resource";
import { Usecases, type UsecasesService } from "@spark-workflow/core/usecases/resource";
import {
  createNodeVersionService,
  transactVersionWrite,
  type NodeVersionService,
} from "@spark-workflow/node-crud";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { defineResource, provide } from "@spark-workflow/resource";
import type { Static } from "@sinclair/typebox";
import { better } from "better-drizzle";

import { categories, documentTypes, formalCompletenessSchema } from "./db/schema.ts";
import { formalCompletenessErrors } from "./errors.ts";
import { FormalCompletenessNodes } from "./node/descriptor.ts";
import { getFormalResults, processFormalResults, processTocResults } from "./results.ts";
import { TemplateDocumentTypeResponseSchema } from "./schemas.ts";

export interface FormalCompletenessVersioningService extends NodeVersionService {
  initializeRequiredDocumentTypes(
    projectId: string,
    projectTypeId: string,
    projectVersion: number,
  ): Promise<void>;
  sendResults(
    projectId: string,
    projectVersion: number | undefined,
    fileId: string,
  ): ReturnType<typeof processFormalResults>;
  getResults(projectId: string, projectVersion: number): ReturnType<typeof getFormalResults>;
  getTemplateDocumentTypes(
    projectId: string,
    projectVersion: number,
  ): Promise<Static<typeof TemplateDocumentTypeResponseSchema>[]>;
  sendTocResults(
    projectId: string,
    projectVersion: number | undefined,
    fileId: string,
  ): ReturnType<typeof processTocResults>;
}

export const FormalCompletenessVersioning = defineResource<FormalCompletenessVersioningService>()(
  "formal-completeness/Versioning",
);

export const CUSTOM_CATEGORY_NAME = "Benutzerdefiniert";

export const initializeRequiredDocumentTypes = async (
  postgres: PostgresScope<typeof formalCompletenessSchema>,
  usecases: UsecasesService,
  projects: Pick<ProjectsService, "validateWriteVersion" | "projectTypeId">,
  projectId: string,
  projectTypeId: string,
  projectVersion: number,
) => {
  const usecase = await usecases.getUsecase(projectTypeId);
  if (usecase.isErr()) throw usecase.error;
  const templateRows = usecase.value.dokumente.categories.map((category) => ({
    name: category.category,
    templateDocumentTypes: category.document_types.map((documentType) => ({
      name: documentType.name,
      description: documentType.description,
    })),
  }));
  await transactVersionWrite({ postgres, projects, projectId, projectVersion }, async () => {
    const storedProjectTypeId = await projects.projectTypeId(projectId, projectVersion);
    if (storedProjectTypeId.isErr()) throw storedProjectTypeId.error;
    if (storedProjectTypeId.value !== projectTypeId) {
      throw formalCompletenessErrors.PROJECT_TYPE_MISMATCH({
        internal: { projectId, projectVersion, projectTypeId },
      });
    }
    await postgres.query(async (query) => {
      const transaction = better(query, { schema: formalCompletenessSchema });
      const registration = await transaction.projectTemplateVersions.findFirst({
        select: { id: true, projectTypeId: true },
        where: { projectId, projectVersion, isDeleted: false },
      });
      if (registration === null) {
        await transaction.projectTemplateVersions.create({
          data: { id: Bun.randomUUIDv7(), projectId, projectVersion, projectTypeId, version: 1 },
        });
      } else if (registration.projectTypeId === null) {
        await transaction.projectTemplateVersions.update({
          data: { projectTypeId },
          where: { id: registration.id, projectVersion },
        });
      }
      const categoryNames = new Set([
        CUSTOM_CATEGORY_NAME,
        ...templateRows.map(({ name }) => name),
      ]);
      const storedCategories = await transaction.categories.findMany({
        select: { id: true, name: true },
        where: { projectId, projectVersion, isDeleted: false },
      });
      const categoryIds = new Map(storedCategories.map(({ id, name }) => [name, id]));
      const newCategories: (typeof categories.$inferInsert)[] = [];
      for (const name of categoryNames) {
        if (categoryIds.has(name)) continue;
        const id = Bun.randomUUIDv7();
        categoryIds.set(name, id);
        newCategories.push({ id, projectId, projectVersion, name });
      }
      if (newCategories.length > 0) {
        await transaction.categories.createMany({ data: newCategories });
      }
      const currentTypes = await transaction.documentTypes.findMany({
        select: { id: true, name: true, origin: true, categoryId: true, description: true },
        where: { projectId, projectVersion, isDeleted: false },
      });
      const byName = new Map(
        currentTypes.map((documentType) => [documentType.name, documentType]),
      );
      const newDocumentTypes: (typeof documentTypes.$inferInsert)[] = [];
      const updatedDocumentTypes = new Map<
        string,
        { id: string; categoryId: string; description: string }
      >();
      for (const category of templateRows) {
        const categoryId = categoryIds.get(category.name)!;
        for (const documentType of category.templateDocumentTypes) {
          const current = byName.get(documentType.name);
          if (current === undefined) {
            const inserted = {
              id: Bun.randomUUIDv7(),
              projectId,
              projectVersion,
              categoryId,
              name: documentType.name,
              description: documentType.description,
              origin: "system",
            };
            newDocumentTypes.push(inserted);
            byName.set(documentType.name, inserted);
          } else if (
            current.origin === "system" &&
            (current.categoryId !== categoryId ||
              current.description !== documentType.description)
          ) {
            updatedDocumentTypes.set(current.id, {
              id: current.id,
              categoryId,
              description: documentType.description,
            });
          }
        }
      }
      if (newDocumentTypes.length > 0) {
        await transaction.documentTypes.createMany({ data: newDocumentTypes });
      }
      if (updatedDocumentTypes.size > 0) {
        await transaction.documentTypes.updateEach({
          by: documentTypes.id,
          data: [...updatedDocumentTypes.values()],
          update: {
            categoryId: (row) => row.categoryId as string,
            description: (row) => row.description as string,
          },
          where: { projectVersion },
        });
      }
      await recordAuditEntry(query, {
        projectId,
        entityType: "project",
        entityId: projectId,
        changeType: "action",
        actionType: "formal_completeness_requirements_initialized",
      });
    });
  });
};

export async function getTemplateDocumentTypes(
  postgres: PostgresScope<typeof formalCompletenessSchema>,
  projectId: string,
  projectVersion: number,
  projectTypeId: () => Promise<string>,
  usecases: UsecasesService,
) {
  const registration = await postgres.query(async (query) =>
    better(query, { schema: formalCompletenessSchema }).projectTemplateVersions.findFirst({
      select: { projectTypeId: true },
      where: { projectId, projectVersion, isDeleted: false },
    }),
  );
  const resolvedProjectTypeId = registration?.projectTypeId ?? (await projectTypeId());
  const usecase = await usecases.getUsecase(resolvedProjectTypeId);
  if (usecase.isErr()) throw usecase.error;
  return usecase.value.dokumente.categories.flatMap((category) =>
    category.document_types.map((documentType) => ({
      category: category.category,
      documentTypeId: documentType.id,
      documentTypeName: documentType.name,
      documentTypeDescription: documentType.description,
      expectedCount: documentType.expected_count,
    })),
  );
}

export const formalCompletenessVersioningProvider = provide({
  resource: FormalCompletenessVersioning,
  needs: {
    postgres: PostgreSQL,
    documents: Documents,
    projects: Projects,
    usecases: Usecases,
    nodes: FormalCompletenessNodes,
  },
  make: ({ postgres, documents, projects, usecases, nodes }) => {
    const scope = postgres.scope(formalCompletenessSchema);
    return Object.freeze<FormalCompletenessVersioningService>({
      ...createNodeVersionService(nodes),
      initializeRequiredDocumentTypes: (projectId, projectTypeId, projectVersion) =>
        initializeRequiredDocumentTypes(
          scope,
          usecases,
          projects,
          projectId,
          projectTypeId,
          projectVersion,
        ),
      sendResults: (projectId, projectVersion, fileId) =>
        processFormalResults(
          scope,
          documents,
          projects,
          projectId,
          projectVersion,
          fileId,
        ),
      getResults: (projectId, projectVersion) => getFormalResults(scope, projectId, projectVersion),
      getTemplateDocumentTypes: (projectId, projectVersion) =>
        getTemplateDocumentTypes(
          scope,
          projectId,
          projectVersion,
          async () => {
            const resolved = await projects.projectTypeId(projectId, projectVersion);
            if (resolved.isErr()) throw resolved.error;
            const projectTypeId = resolved.value;
            if (projectTypeId === null) {
              throw formalCompletenessErrors.PROJECT_RESPONSE_INVALID({
                internal: { projectId, invalidField: "projectTypeId" },
              });
            }
            return projectTypeId;
          },
          usecases,
        ),
      sendTocResults: (projectId, projectVersion, fileId) =>
        processTocResults(
          scope,
          documents,
          projects,
          projectId,
          projectVersion,
          fileId,
        ),
    });
  },
});
