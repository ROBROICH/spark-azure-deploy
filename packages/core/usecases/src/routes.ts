import { authentication } from "@spark-workflow/authentification";
import {
  assertRestQuery,
  RestPaginationQueryProperties,
  RestQueryErrorSchema,
  parseRestPagination,
  restPageResponseSchema,
  restPaginationMetadata,
  type RestPagination,
  recordRequestAudit,
} from "@spark-workflow/http-host";
import { Type } from "@sinclair/typebox";
import { type AnyElysia, status } from "elysia";
import { defineAuditCatalog } from "evlog";

import type { CoreRouteApp } from "../../projects/src/http.ts";
import {
  UsecaseCatalogResponseSchema,
  UsecaseIdParamsSchema,
  UsecaseResponseSchema,
  UsecaseUpdateSchema,
  UsecaseWriteSchema,
  type UsecaseResponse,
} from "./formats.ts";
import type { UsecasesService } from "./resource.ts";

type RuntimeContext<App extends AnyElysia> = App["~Singleton"]["decorator"] &
  App["~Singleton"]["derive"] &
  App["~Singleton"]["resolve"] &
  App["~Ephemeral"]["derive"] &
  App["~Ephemeral"]["resolve"] &
  App["~Volatile"]["derive"] &
  App["~Volatile"]["resolve"];

type UsecasesServiceResolver<App extends AnyElysia> = (
  context: RuntimeContext<App>,
) => UsecasesService;

interface UsecaseRouteOptions {
  readonly collectionRoute: "" | "/";
  readonly operationIds: Readonly<{
    create: string;
    delete?: string;
    get: string;
    update: string;
  }>;
  readonly path: string;
  readonly strictQuery: boolean;
}

const usecaseAudit = defineAuditCatalog("usecases", {
  USECASE_CREATE: { target: "usecase", severity: "high" },
  USECASE_UPDATE: { target: "usecase", severity: "high" },
  USECASE_DELETE: { target: "usecase", severity: "high" },
});

const UsecaseCollectionQuerySchema = Type.Object(
  { ...RestPaginationQueryProperties },
  { additionalProperties: true },
);
const LegacyUsecaseIdParamsSchema = Type.Object(
  { usecaseId: Type.String() },
  { additionalProperties: false },
);

const pageUsecases = (usecases: readonly UsecaseResponse[], pagination: RestPagination) => {
  const data = usecases.slice(pagination.offset, pagination.offset + pagination.limit);
  return {
    data,
    pagination: restPaginationMetadata(pagination, data.length, usecases.length),
  };
};

const assertUsecaseQuery = (strict: boolean, request: Request): void => {
  if (strict) assertRestQuery(request);
};

const bindUsecaseOperations = <const App extends CoreRouteApp>(
  app: App,
  resolveUsecases: UsecasesServiceResolver<App>,
  options: UsecaseRouteOptions,
) => {
  const paramsSchema = options.strictQuery ? UsecaseIdParamsSchema : LegacyUsecaseIdParamsSchema;
  const routes = app.group(options.path, (app) =>
    app
      .guard({ auth: { roles: ["admin", "service", "user"] } }, (guarded) =>
        guarded.get(
          "/:usecaseId",
          async (context) => {
            assertUsecaseQuery(options.strictQuery, context.request);
            const result = await resolveUsecases(context).getUsecase(context.params.usecaseId);
            if (result.isErr()) throw result.error;
            return result.value;
          },
          {
            params: paramsSchema,
            response: options.strictQuery
              ? { 200: UsecaseResponseSchema, 400: RestQueryErrorSchema }
              : UsecaseResponseSchema,
            detail: { operationId: options.operationIds.get },
          },
        ),
      )
      .guard({ auth: { roles: ["admin", "service"] } }, (guarded) =>
        guarded
          .post(
            options.collectionRoute,
            async (context) => {
              assertUsecaseQuery(options.strictQuery, context.request);
              const result = await resolveUsecases(context).create(context.body);
              if (result.isErr()) throw result.error;
              recordRequestAudit((actor) => usecaseAudit.USECASE_CREATE({ actor, target: { id: result.value.slug } }));
              return status(201, result.value);
            },
            {
              body: UsecaseWriteSchema,
              response: options.strictQuery
                ? { 201: UsecaseResponseSchema, 400: RestQueryErrorSchema }
                : { 201: UsecaseResponseSchema },
              detail: { operationId: options.operationIds.create },
            },
          )
          .put(
            "/:usecaseId",
            async (context) => {
              assertUsecaseQuery(options.strictQuery, context.request);
              const result = await resolveUsecases(context).update(
                context.params.usecaseId,
                context.body,
              );
              if (result.isErr()) throw result.error;
              recordRequestAudit((actor) => usecaseAudit.USECASE_UPDATE({ actor, target: { id: result.value.slug } }));
              return result.value;
            },
            {
              params: paramsSchema,
              body: UsecaseUpdateSchema,
              response: options.strictQuery
                ? { 200: UsecaseResponseSchema, 400: RestQueryErrorSchema }
                : UsecaseResponseSchema,
              detail: { operationId: options.operationIds.update },
            },
          ),
      ),
  );
  if (options.operationIds.delete === undefined) return routes;
  const deleteOperationId = options.operationIds.delete;
  return routes.group(options.path, (app) =>
    app.guard({ auth: { roles: ["admin", "service"] } }, (guarded) =>
      guarded.delete(
        "/:usecaseId",
        async (context) => {
          assertUsecaseQuery(options.strictQuery, context.request);
          const result = await resolveUsecases(context).delete(context.params.usecaseId);
          if (result.isErr()) throw result.error;
          recordRequestAudit((actor) => usecaseAudit.USECASE_DELETE({ actor, target: { id: result.value.slug } }));
          return result.value;
        },
        {
          params: paramsSchema,
          response: options.strictQuery
            ? { 200: UsecaseResponseSchema, 400: RestQueryErrorSchema }
            : UsecaseResponseSchema,
          detail: { operationId: deleteOperationId },
        },
      ),
    ),
  );
};

export const createUsecaseCatalogRoutes = <const App extends CoreRouteApp>(
  app: App,
  resolveUsecases: UsecasesServiceResolver<App>,
) => {
  const authenticated = app.use(authentication);
  const listed = authenticated.group("/catalog/usecases", (app) =>
    app.guard({ auth: { roles: ["admin", "service", "user"] } }, (guarded) =>
      guarded.get(
        "/",
        async (context) => {
          const result = await resolveUsecases(context).list();
          if (result.isErr()) throw result.error;
          return result.value;
        },
        {
          response: UsecaseCatalogResponseSchema,
          detail: { operationId: "listCatalogUsecases" },
        },
      ),
    ),
  );
  return bindUsecaseOperations(listed, (context) => resolveUsecases(context), {
    collectionRoute: "/",
    operationIds: {
      create: "createCatalogUsecase",
      get: "getCatalogUsecase",
      update: "updateCatalogUsecase",
    },
    path: "/catalog/usecases",
    strictQuery: false,
  });
};

export const createUsecaseV2Routes = <const App extends CoreRouteApp>(
  app: App,
  resolveUsecases: UsecasesServiceResolver<App>,
) => {
  const authenticated = app.use(authentication);
  const listed = authenticated.group("/usecases", (app) =>
    app.guard({ auth: { roles: ["admin", "service", "user"] } }, (guarded) =>
      guarded.get(
        "",
        async (context) => {
          const pagination = parseRestPagination(context.request, context.query);
          const result = await resolveUsecases(context).list();
          if (result.isErr()) throw result.error;
          return pageUsecases(result.value.usecases, pagination);
        },
        {
          query: UsecaseCollectionQuerySchema,
          response: {
            200: restPageResponseSchema(UsecaseResponseSchema),
            400: RestQueryErrorSchema,
          },
          detail: { operationId: "v2ListUsecases" },
        },
      ),
    ),
  );
  return bindUsecaseOperations(listed, (context) => resolveUsecases(context), {
    collectionRoute: "",
    operationIds: {
      create: "v2CreateUsecase",
      delete: "v2DeleteUsecase",
      get: "v2GetUsecase",
      update: "v2UpdateUsecase",
    },
    path: "/usecases",
    strictQuery: true,
  });
};
