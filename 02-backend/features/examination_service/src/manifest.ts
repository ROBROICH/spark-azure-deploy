import { Projects } from "@spark-workflow/core/projects/resource";
import { defineFeature } from "@spark-workflow/resource";

import { examinationSchema } from "./db/schema.ts";
import { ExaminationConfiguration } from "./env.ts";
import { ExaminationNodes, examinationNodesProvider } from "./node/descriptor.ts";
import {
  ExaminationVersioning,
  examinationVersioningProvider,
  normDeconstructionsProvider,
} from "./resource.ts";
import { examinationEntities } from "./v2-entities.ts";

export const feature = defineFeature({
  id: "examination",
  needs: {
    projects: Projects,
    configuration: ExaminationConfiguration,
    examination: ExaminationVersioning,
    nodes: ExaminationNodes,
    ...examinationEntities.needs,
  },
  providers: [
    examinationNodesProvider,
    normDeconstructionsProvider,
    examinationVersioningProvider,
    ...examinationEntities.providers,
  ],
  tables: examinationSchema,
});
