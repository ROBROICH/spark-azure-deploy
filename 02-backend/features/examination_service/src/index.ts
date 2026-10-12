import type { FeatureHttp } from "@spark-workflow/http-host";
import {
  createNodeRoutes,
  createNodeVersionRoutes,
  type NodeRuntimeResolver,
} from "@spark-workflow/node-crud";

import { examinationSchema } from "./db/schema.ts";
import type { feature } from "./manifest.ts";
import { examinationDescriptor } from "./node/descriptor.ts";
import { createLegalBasisRoutes } from "./routes/legal-basis.ts";
import { createNormDeconstructionRoutes } from "./routes/norm-deconstructions.ts";

export const createRoutes = (http: FeatureHttp<typeof feature>) => {
  const nodeRoutes = http
    .controller("examination-service.nodes")
    .guard({ nodes: true }, (app) => {
      const resolveRuntime: NodeRuntimeResolver<typeof app, typeof examinationSchema> = ({
        nodes,
      }) => nodes;
      return createNodeVersionRoutes(
        createNodeRoutes(app, examinationDescriptor, resolveRuntime),
        examinationDescriptor,
        resolveRuntime,
      );
    });
  return createLegalBasisRoutes(http).use(createNormDeconstructionRoutes(http)).use(nodeRoutes);
};

export { createV2Routes } from "./v2-routes.ts";
export { feature } from "./manifest.ts";
export { ExaminationConfiguration, parseExaminationConfiguration } from "./env.ts";
export { ExaminationVersioning, type ExaminationService } from "./resource.ts";
export type { ExaminationNode } from "./db/schema.ts";
