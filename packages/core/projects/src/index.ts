import type { FeatureHttp } from "@spark-workflow/http-host";
import {
  createNodeRoutes,
  createNodeVersionRoutes,
  type NodeRuntimeResolver,
} from "@spark-workflow/node-crud";
import type { PostgreSQLService } from "@spark-workflow/postgres-runtime";

import type { coreFeature } from "../../src/manifest.ts";
import { createUsecaseCatalogRoutes, seedUsecaseCatalog } from "../../usecases/src/index.ts";
import { lockCatalogWrites } from "../../usecases/src/resource.ts";
import { projectLogicSchema, projectStatuses, projectTypes } from "./db/schema.ts";
import { projectLogicModels } from "./db.ts";
import { projectNodeDescriptor } from "./runtime.ts";
import { createDeadlineRoutes } from "./routes/deadlines.ts";
import { createProjectRoutes } from "./routes/projects.ts";
import { createReferenceDataRoutes } from "./routes/reference-data.ts";
import { createTopicRoutes } from "./routes/topics.ts";

export { createProjectV2Routes } from "./v2-routes.ts";

const projectStatusSeed = [
  { id: "00000000-0000-0000-0000-000000000000", name: "Offen", internalName: "OPEN" },
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "In Bearbeitung",
    internalName: "IN_PROGRESS",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "In Erstellung",
    internalName: "IN_CREATION",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "Abgeschlossen",
    internalName: "COMPLETED",
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    name: "In Erstellung",
    internalName: "UPLOAD_DOCUMENTS",
  },
];

export function createProjectsRoutes(http: FeatureHttp<typeof coreFeature>) {
  const controller = http.controller("core.projects.routes");
  const usecases = controller.guard({ usecases: true }, (guarded) =>
    createUsecaseCatalogRoutes(guarded, ({ usecases }) => usecases),
  );
  const references = createReferenceDataRoutes(usecases);
  const projects = createProjectRoutes(references);
  const topics = createTopicRoutes(projects);
  return createDeadlineRoutes(topics).guard({ projectNodes: true }, (app) => {
    const resolveRuntime: NodeRuntimeResolver<typeof app, typeof projectLogicSchema> = ({
      projectNodes,
    }) => projectNodes;
    return createNodeVersionRoutes(
      createNodeRoutes(app, projectNodeDescriptor, resolveRuntime),
      projectNodeDescriptor,
      resolveRuntime,
    );
  });
}

export async function seedCoreDatabase(postgres: PostgreSQLService): Promise<void> {
  const scope = postgres.scope(projectLogicSchema);
  await scope.transact(() =>
    scope.query(async (transaction) => {
      await lockCatalogWrites(transaction);
      const catalog = await seedUsecaseCatalog(projectLogicModels(transaction));
      if (catalog.isErr()) throw catalog.error;
      const catalogProjectTypes = catalog.value.usecases.map(({ projekttyp }) => projekttyp);
      if (catalogProjectTypes.length > 0) {
        await transaction
          .insert(projectTypes)
          .values(catalogProjectTypes)
          .onConflictDoNothing({ target: projectTypes.id });
      }
      await transaction
        .insert(projectStatuses)
        .values([...projectStatusSeed])
        .onConflictDoNothing({ target: projectStatuses.id });
    }),
  );
}

export async function startProjectLogicTemporalWorker(
  postgres: PostgreSQLService,
  configuration: import("./env.ts").ProjectWorkerConfiguration,
  services: import("./temporal/services.ts").ProjectLogicWorkerServices,
  reportWorkflowStatus: (
    event: import("@spark-temporal/contracts").WorkflowStatusEvent,
  ) => Promise<void>,
) {
  const scope = postgres.scope(projectLogicSchema);
  return (await import("./worker.ts")).startProjectLogicTemporalWorker(
    scope,
    configuration,
    services,
    reportWorkflowStatus,
  );
}

export type { ProjectLogicWorkerServices } from "./temporal/services.ts";
export {
  Applicants,
  ProjectLogicVersioning,
  ProjectCommandConfiguration,
  ProjectConfiguration,
  Projects,
  ProjectTemporalCommands,
  type ApplicantsService,
  type ProjectsResourceService,
  type ProjectsService,
} from "./resource.ts";
export {
  ProcessSteps,
  ProjectStatuses,
  ProjectTypes,
  type ProcessStepsService,
  type ProjectStatusesService,
  type ProjectTypesService,
} from "./reference-data.ts";
export {
  parseProjectCommandConfiguration,
  parseProjectConfiguration,
  parseProjectWorkerConfiguration,
} from "./env.ts";
export {
  projectLogicVersioningProvider,
  ProjectNodes,
  projectNodesProvider,
  projectTemporalCommandsProvider,
  projectsProvider,
  usecasesProvider,
} from "./runtime.ts";
export { Usecases, type UsecasesService } from "../../usecases/src/resource.ts";
