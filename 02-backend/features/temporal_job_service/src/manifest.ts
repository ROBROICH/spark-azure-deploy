import { defineFeature } from "@spark-workflow/resource";

import { temporalJobDatabaseSchema } from "./db/schema.ts";
import { TemporalQueryConfiguration, TemporalWorkflows } from "./resource.ts";
import { temporalWorkflowsProvider } from "./runtime.ts";

export const feature = defineFeature({
  id: "temporal-job",
  needs: {
    temporalWorkflows: TemporalWorkflows,
    temporalQueryConfiguration: TemporalQueryConfiguration,
  },
  providers: [temporalWorkflowsProvider],
  tables: temporalJobDatabaseSchema,
});
