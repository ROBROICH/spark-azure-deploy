import { provide } from "@spark-workflow/resource";

import { TemporalQueryConfiguration, TemporalWorkflows } from "./resource.ts";
import { connectTemporalWorkflows } from "./temporal/queries.ts";

export const temporalWorkflowsProvider = provide({
  resource: TemporalWorkflows,
  needs: { configuration: TemporalQueryConfiguration },
  make: ({ configuration }) => connectTemporalWorkflows(configuration),
  release: (workflows) => workflows.close(),
});
