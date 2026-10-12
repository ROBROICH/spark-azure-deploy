import type { FeatureHttp } from "@spark-workflow/http-host";
import {
  createNodeRoutes,
  createNodeVersionRoutes,
  type NodeRuntimeResolver,
} from "@spark-workflow/node-crud";

import { formalCompletenessSchema } from "./db/schema.ts";
import type { feature } from "./manifest.ts";
import { formalCompletenessDescriptor } from "./node/descriptor.ts";
import { createFormalRoutes } from "./routes/formal.ts";

export const createRoutes = (http: FeatureHttp<typeof feature>) => {
  const nodeRoutes = http
    .controller("formal-completeness-check.nodes")
    .guard({ nodes: true }, (app) => {
      const resolveRuntime: NodeRuntimeResolver<typeof app, typeof formalCompletenessSchema> = ({
        nodes,
      }) => nodes;
      return createNodeVersionRoutes(
        createNodeRoutes(app, formalCompletenessDescriptor, resolveRuntime, {
          addUpdateEndpoint: false,
        }),
        formalCompletenessDescriptor,
        resolveRuntime,
      );
    });
  return createFormalRoutes(http).use(nodeRoutes);
};

export { createV2Routes } from "./v2-routes.ts";
export { feature } from "./manifest.ts";
export {
  FormalCompletenessVersioning,
  type FormalCompletenessVersioningService,
} from "./versioning.ts";
