import type { FeatureHttp } from "@spark-workflow/http-host";
import { Type } from "@sinclair/typebox";

import { templateManagementPolicy } from "../auth-policy.ts";
import type { feature } from "../manifest.ts";
import { TemplateCategoryResponseSchema, UuidSchema } from "../schemas.ts";

const projectTypeParams = Type.Object({ projectId: UuidSchema }, { additionalProperties: false });

export const createTemplateRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("formal-completeness-check.routes.templates")
    .model({
      TemplateCategoryResponse: TemplateCategoryResponseSchema,
    })
    .get(
      "/:projectId/template-categories",
      async ({ params, usecases }) => {
        const usecase = await usecases.getUsecase(params.projectId);
        if (usecase.isErr()) throw usecase.error;
        return usecase.value.dokumente.categories.map((category) => ({
          id: category.id,
          name: category.category,
          projectTypeId: usecase.value.projekttyp.id,
          templateDocumentTypes: category.document_types.map((documentType) => ({
            id: documentType.id,
            name: documentType.name,
            description: documentType.description,
            expectedCount: documentType.expected_count,
          })),
        }));
      },
      {
        params: projectTypeParams,
        response: Type.Array(TemplateCategoryResponseSchema),
        auth: templateManagementPolicy,
        usecases: true,
        detail: { operationId: "listTemplateCategories" },
      },
    );
