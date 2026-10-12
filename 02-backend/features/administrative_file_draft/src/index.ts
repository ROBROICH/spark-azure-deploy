import type { FeatureHttp } from "@spark-workflow/http-host";
import {
  createNodeRoutes,
  createNodeVersionRoutes,
  type NodeRuntimeResolver,
} from "@spark-workflow/node-crud";

import { afdSchema } from "./db/schema";
import type { feature } from "./manifest.ts";
import { administrativeFileDraftDescriptor } from "./node/descriptor.ts";
import { createExportRoutes } from "./routes/exports";
import { createRiskRoutes } from "./routes/risks";
import { createTemplateRoutes } from "./routes/templates";

export const createRoutes = (http: FeatureHttp<typeof feature>) => {
  const nodeRoutes = http
    .controller("administrative-file-draft.nodes")
    .guard({ nodes: true }, (app) => {
      const resolveRuntime: NodeRuntimeResolver<typeof app, typeof afdSchema> = ({ nodes }) =>
        nodes;
      return createNodeVersionRoutes(
        createNodeRoutes(app, administrativeFileDraftDescriptor, resolveRuntime),
        administrativeFileDraftDescriptor,
        resolveRuntime,
      );
    });
  return createRiskRoutes(http)
    .use(createTemplateRoutes(http))
    .use(createExportRoutes(http))
    .use(nodeRoutes);
};

export { createV2Routes } from "./v2-routes.ts";
export { feature } from "./manifest.ts";
export {
  AdministrativeFileDraftConfiguration,
  parseAdministrativeFileDraftConfiguration,
} from "./env.ts";
export {
  AdministrativeFileDraftVersioning,
  type AdministrativeFileDraftVersioningService,
  type RiskInsertPayload,
  type RiskMutationInput,
} from "./versioning.ts";
