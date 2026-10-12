import { Documents } from "@spark-workflow/core/documents/resource";
import { Projects } from "@spark-workflow/core/projects/resource";
import { Usecases } from "@spark-workflow/core/usecases/resource";
import { defineFeature } from "@spark-workflow/resource";

import { formalCompletenessSchema } from "./db/schema.ts";
import {
  FormalCompletenessNodes,
  formalCompletenessNodesProvider,
} from "./node/descriptor.ts";
import {
  FormalCompletenessVersioning,
  formalCompletenessVersioningProvider,
} from "./versioning.ts";
import { formalCompletenessEntities } from "./v2-entities.ts";

export const feature = defineFeature({
  id: "formal-completeness",
  needs: {
    projects: Projects,
    documents: Documents,
    usecases: Usecases,
    formalCompleteness: FormalCompletenessVersioning,
    nodes: FormalCompletenessNodes,
    ...formalCompletenessEntities.needs,
  },
  providers: [
    formalCompletenessNodesProvider,
    formalCompletenessVersioningProvider,
    ...formalCompletenessEntities.providers,
  ],
  tables: formalCompletenessSchema,
});
