import type { FeatureHttp } from "@spark-workflow/http-host";
import {
  createNodeRoutes,
  createNodeVersionRoutes,
  type NodeRuntimeResolver,
} from "@spark-workflow/node-crud";

import { objectionsSchema } from "./db/schema.ts";
import type { feature } from "./manifest.ts";
import {
  bindObjectionsVersionRuntime,
  createOmsModels,
  objectionsDescriptor,
  objectionsVersionDescriptor,
} from "./node/descriptor.ts";
import { createArgumentRoutes } from "./routes/arguments.ts";
import { createEwmsRoutes } from "./routes/ewms.ts";

export const createRoutes = (http: FeatureHttp<typeof feature>) => {
  const nodeRoutes = http.controller("objections-management.nodes").guard({ nodes: true }, (app) => {
    const resolveRuntime: NodeRuntimeResolver<typeof app, typeof objectionsSchema> = ({
      nodes,
    }) => nodes;
    return createNodeVersionRoutes(
      createNodeRoutes(app, objectionsDescriptor, resolveRuntime),
      objectionsVersionDescriptor,
      ({ nodes }) => bindObjectionsVersionRuntime(nodes),
    );
  });
  return http
    .controller("objections-management.routes")
    .use(createOmsModels())
    .use(createEwmsRoutes(http))
    .use(createArgumentRoutes(http))
    .use(nodeRoutes);
};

export { createV2Routes } from "./v2-routes.ts";
export { feature } from "./manifest.ts";
export { Objections, ObjectionsVersioning } from "./resource.ts";
