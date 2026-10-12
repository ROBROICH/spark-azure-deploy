import type { FeatureHttp } from "@spark-workflow/http-host";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { and, asc, eq, inArray } from "drizzle-orm";
import { status } from "elysia";

import { categories, documentTypes } from "../db/schema.ts";
import type { feature } from "../manifest.ts";
import {
  createCustomDocumentType,
  deleteCustomDocumentType,
  updateDocumentType,
} from "../mutations.ts";
import {
  createProjectPolicy,
  deleteProjectPolicy,
  serviceOnlyPolicy,
  updateProjectPolicy,
} from "../auth-policy.ts";
import {
  CreateRequiredDocumentTypeSchema,
  InitializeRequiredDocumentTypesSchema,
  PatchRequiredDocumentTypeSchema,
  ProjectParamsSchema,
  RequiredDocumentParamsSchema,
  RequiredDocumentResponseSchema,
  RequiredDocumentTypesResponseSchema,
  RequiredProjectVersionQuerySchema,
  SuccessResponseSchema,
  TemplateDocumentTypeResponseSchema,
} from "../schemas.ts";
export const createRequirementRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("formal-completeness-check.routes.requirements")
    .model({
      RequiredDocumentResponse: RequiredDocumentResponseSchema,
      RequiredDocumentTypesResponse: RequiredDocumentTypesResponseSchema,
      TemplateDocumentTypeResponse: TemplateDocumentTypeResponseSchema,
      V1FormalCompletenessSuccessResponse: SuccessResponseSchema,
    })
    .get(
      "/:projectId/template-document-types",
      ({ params, query, formalCompleteness }) =>
        formalCompleteness.getTemplateDocumentTypes(params.projectId, query.projectVersion),
      {
        params: ProjectParamsSchema,
        query: RequiredProjectVersionQuerySchema,
        response: Type.Array(TemplateDocumentTypeResponseSchema),
        formalCompleteness: true,
        detail: { operationId: "getTemplateDocumentTypes" },
      },
    )
    .get(
      "/:projectId/required-document-types",
      async ({ params, postgres, projectVersion }) => {
        return postgres.query(async (database) => {
          const categoryRows = await database
            .select({ categoryId: categories.id, categoryName: categories.name })
            .from(categories)
            .where(
              and(
                eq(categories.projectId, params.projectId),
                eq(categories.projectVersion, projectVersion),
                eq(categories.isDeleted, false),
              ),
            )
            .orderBy(asc(categories.name), asc(categories.id));
          const categoryIds = categoryRows.map(({ categoryId }) => categoryId);
          const typeRows =
            categoryIds.length === 0
              ? []
              : await database
                  .select({
                    categoryId: documentTypes.categoryId,
                    documentTypeId: documentTypes.id,
                    documentName: documentTypes.name,
                    origin: documentTypes.origin,
                    isResolved: documentTypes.isResolved,
                  })
                  .from(documentTypes)
                  .where(
                    and(
                      eq(documentTypes.projectId, params.projectId),
                      eq(documentTypes.projectVersion, projectVersion),
                      eq(documentTypes.isDeleted, false),
                      inArray(documentTypes.categoryId, categoryIds),
                    ),
                  )
                  .orderBy(asc(documentTypes.createdAt), asc(documentTypes.id));
          const response: {
            categoryId: string;
            categoryName: string;
            requiredDocuments: {
              documentTypeId: string;
              documentName: string;
              origin: "system" | "custom";
              isResolved: boolean;
            }[];
          }[] = [];
          for (const category of categoryRows) {
            const requiredDocuments: (typeof response)[number]["requiredDocuments"] = [];
            for (const documentType of typeRows) {
              if (documentType.categoryId === category.categoryId) {
                requiredDocuments.push(
                  Value.Parse(RequiredDocumentResponseSchema, {
                    documentTypeId: documentType.documentTypeId,
                    documentName: documentType.documentName,
                    origin: documentType.origin,
                    isResolved: documentType.isResolved,
                  }),
                );
              }
            }
            response.push({ ...category, requiredDocuments });
          }
          return { categories: response };
        });
      },
      {
        params: ProjectParamsSchema,
        response: RequiredDocumentTypesResponseSchema,
        projectVersion: true,
        detail: { operationId: "getRequiredDocumentTypes" },
      },
    )
    .post(
      "/:projectId/required-document-types/initialize",
      async ({ params, query, body, formalCompleteness }) => {
        await formalCompleteness.initializeRequiredDocumentTypes(
          params.projectId,
          body.projectTypeId,
          query.projectVersion,
        );
        return { success: true };
      },
      {
        params: ProjectParamsSchema,
        query: RequiredProjectVersionQuerySchema,
        body: InitializeRequiredDocumentTypesSchema,
        response: SuccessResponseSchema,
        auth: serviceOnlyPolicy,
        formalCompleteness: true,
        detail: { operationId: "initializeRequiredDocumentTypes" },
      },
    )
    .post(
      "/:projectId/required-document-types",
      async ({ params, body, postgres, projects, projectVersion }) => {
        const created = await createCustomDocumentType({
          postgres,
          projects,
          projectId: params.projectId,
          projectVersion,
          documentName: body.documentName,
        });
        return status(201, {
          documentTypeId: created.id,
          documentName: created.name,
          origin: "custom",
          isResolved: created.isResolved,
        });
      },
      {
        params: ProjectParamsSchema,
        body: CreateRequiredDocumentTypeSchema,
        response: { 201: RequiredDocumentResponseSchema },
        auth: createProjectPolicy,
        projects: true,
        latestProjectVersion: true,
        detail: { operationId: "createRequiredDocumentType" },
      },
    )
    .patch(
      "/:projectId/required-document-types/:documentTypeId",
      async ({ params, body, postgres, projects, projectVersion }) => {
        const updated = await updateDocumentType({
          postgres,
          projects,
          projectId: params.projectId,
          projectVersion,
          documentTypeId: params.documentTypeId,
          documentName: body.documentName,
          isResolved: body.isResolved,
        });
        return Value.Parse(RequiredDocumentResponseSchema, {
          documentTypeId: updated.id,
          documentName: updated.name,
          origin: updated.origin,
          isResolved: updated.isResolved,
        });
      },
      {
        params: RequiredDocumentParamsSchema,
        body: PatchRequiredDocumentTypeSchema,
        response: RequiredDocumentResponseSchema,
        auth: updateProjectPolicy,
        projects: true,
        latestProjectVersion: true,
        detail: { operationId: "patchRequiredDocumentType" },
      },
    )
    .delete(
      "/:projectId/required-document-types/:documentTypeId",
      async ({ params, postgres, projects, projectVersion }) => {
        await deleteCustomDocumentType({
          postgres,
          projects,
          projectId: params.projectId,
          projectVersion,
          documentTypeId: params.documentTypeId,
        });
        return { success: true };
      },
      {
        params: RequiredDocumentParamsSchema,
        response: SuccessResponseSchema,
        auth: deleteProjectPolicy,
        projects: true,
        latestProjectVersion: true,
        detail: { operationId: "deleteRequiredDocumentType" },
      },
    );
