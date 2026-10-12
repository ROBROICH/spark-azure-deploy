import type { FeatureHttp } from "@spark-workflow/http-host";
import {
  createNodeRoutes,
  createNodeVersionRoutes,
  type NodeRuntimeResolver,
} from "@spark-workflow/node-crud";

import { plausibilitySchema } from "./db/schema.ts";
import type { feature } from "./manifest.ts";
import { plausibilityDescriptor } from "./nodes.ts";
import { createPlausibilityNoteRoutes } from "./routes/plausibility-notes.ts";

export const createRoutes = (http: FeatureHttp<typeof feature>) => {
  const nodeRoutes = http
    .controller("plausibility-notes.nodes")
    .guard({ nodes: true }, (app) => {
      const resolveRuntime: NodeRuntimeResolver<typeof app, typeof plausibilitySchema> = ({
        nodes,
      }) => nodes;
      return createNodeVersionRoutes(
        createNodeRoutes(app, plausibilityDescriptor, resolveRuntime),
        plausibilityDescriptor,
        resolveRuntime,
      );
    });
  return createPlausibilityNoteRoutes(http).use(nodeRoutes);
};

export { createV2Routes } from "./v2-routes.ts";
export { feature } from "./manifest.ts";
export {
  PlausibilityNotesVersioning,
  type PlausibilityNotesVersioningService,
} from "./resource.ts";
