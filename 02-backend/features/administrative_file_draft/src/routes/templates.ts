import type { AuthPolicy } from "@spark-workflow/authentification";
import type { FeatureHttp } from "@spark-workflow/http-host";
import { Type, type TSchema } from "@sinclair/typebox";

import type { feature } from "../manifest.ts";
import {
  AssignTemplateSchema,
  SuccessResponseSchema,
  TemplateListSchema,
  TemplateNodeResponseSchema,
  TemplateResponseSchema,
  UuidSchema,
} from "../schemas";

const servicePolicy = { roles: ["admin", "service"] } satisfies AuthPolicy;
const templateParams = Type.Object({ templateId: UuidSchema }, { additionalProperties: false });
const assignmentParams = Type.Object(
  { templateId: UuidSchema, projectTypeId: UuidSchema },
  { additionalProperties: false },
);
const listQuery = Type.Object({ projectTypeId: UuidSchema }, { additionalProperties: false });
const catalogInstant = "1970-01-01T00:00:00.000Z";

const catalogTemplate = (usecase: { projekttyp: { id: string; name: string } }) => ({
  id: usecase.projekttyp.id,
  name: usecase.projekttyp.name,
  projectTypeId: usecase.projekttyp.id,
  version: 1,
  isActive: true,
});

export const createTemplateRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("administrative-file-draft.routes.templates")
    .get(
      "/templates",
      async ({ query, usecases }) => {
        const usecase = await usecases.getUsecase(query.projectTypeId);
        if (usecase.isErr()) throw usecase.error;
        return [catalogTemplate(usecase.value)];
      },
      {
        query: listQuery,
        response: TemplateListSchema,
        auth: servicePolicy,
        usecases: true,
        detail: { operationId: "listTemplates" },
      },
    )
    .get(
      "/templates/:templateId",
      async ({ params, usecases }) => {
        const usecase = await usecases.getUsecase(params.templateId);
        if (usecase.isErr()) throw usecase.error;
        return catalogTemplate(usecase.value);
      },
      {
        params: templateParams,
        response: TemplateResponseSchema,
        auth: servicePolicy,
        usecases: true,
        detail: { operationId: "getTemplate" },
      },
    )
    .get(
      "/templates/:templateId/nodes",
      async ({ params, usecases }) => {
        const usecase = await usecases.getUsecase(params.templateId);
        if (usecase.isErr()) throw usecase.error;
        return usecase.value.beschluss.nodes.map((node) => ({
          id: node.id,
          parentVaeNodeId: node.parent_vae_node_id,
          topic: node.topic,
          templateId: usecase.value.projekttyp.id,
          title: node.title,
          text: node.text,
          order: node.order,
          canAddChild: node.can_add_child,
          isHidden: node.is_hidden,
          createdAt: catalogInstant,
          updatedAt: catalogInstant,
          sysPeriod: {
            lower: catalogInstant,
            upper: null,
            bounds: "[)",
            empty: false,
          },
        }));
      },
      {
        params: templateParams,
        response: Type.Array(TemplateNodeResponseSchema) as TSchema,
        auth: servicePolicy,
        usecases: true,
        detail: { operationId: "listTemplateNodes" },
      },
    )
    .post(
      "/templates/:templateId/assign-template/:projectTypeId",
      async ({ params, body, administrativeFileDraft, projects }) => {
        const projectVersion = await projects.resolveLatestVersion(params.templateId);
        if (projectVersion.isErr()) throw projectVersion.error;
        await administrativeFileDraft.assignTemplate(
          params.templateId,
          params.projectTypeId,
          body.topics,
          projectVersion.value,
        );
        return { success: true };
      },
      {
        params: assignmentParams,
        body: AssignTemplateSchema,
        response: SuccessResponseSchema,
        auth: servicePolicy,
        administrativeFileDraft: true,
        projects: true,
        detail: { operationId: "assignTemplate" },
      },
    );
