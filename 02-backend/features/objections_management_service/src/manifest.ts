import { DocumentFiles } from "@spark-workflow/core/documents/resource";
import { Projects } from "@spark-workflow/core/projects/resource";
import { defineFeature } from "@spark-workflow/resource";

import { objectionsSchema } from "./db/schema.ts";
import { ObjectionsNodes, objectionsNodesProvider } from "./node/descriptor.ts";
import { Objections } from "./resource.ts";
import { objectionsProvider, objectionsVersioningProvider } from "./runtime.ts";
import { objectionsEntities } from "./v2-entities.ts";

export const feature = defineFeature({
  id: "objections-management",
  needs: {
    projects: Projects,
    documentFiles: DocumentFiles,
    objections: Objections,
    nodes: ObjectionsNodes,
    ...objectionsEntities.needs,
  },
  providers: [
    objectionsNodesProvider,
    objectionsProvider,
    objectionsVersioningProvider,
    ...objectionsEntities.providers,
  ],
  tables: objectionsSchema,
});
