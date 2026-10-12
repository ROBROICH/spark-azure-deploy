import { Projects } from "@spark-workflow/core/projects/resource";
import { Usecases } from "@spark-workflow/core/usecases/resource";
import { defineFeature } from "@spark-workflow/resource";

import { afdSchema } from "./db/schema.ts";
import { AdministrativeFileDraftConfiguration } from "./env.ts";
import {
  AdministrativeFileDraftNodes,
  administrativeFileDraftNodesProvider,
} from "./node/descriptor.ts";
import {
  AdministrativeFileDraftVersioning,
  administrativeFileDraftVersioningProvider,
} from "./versioning.ts";
import { administrativeFileDraftEntities } from "./v2-entities.ts";

export const feature = defineFeature({
  id: "administrative-file-draft",
  needs: {
    projects: Projects,
    usecases: Usecases,
    configuration: AdministrativeFileDraftConfiguration,
    administrativeFileDraft: AdministrativeFileDraftVersioning,
    nodes: AdministrativeFileDraftNodes,
    ...administrativeFileDraftEntities.needs,
  },
  providers: [
    administrativeFileDraftNodesProvider,
    administrativeFileDraftVersioningProvider,
    ...administrativeFileDraftEntities.providers,
  ],
  tables: afdSchema,
});
