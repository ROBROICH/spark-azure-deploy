import { defineResource } from "@spark-workflow/resource";

import type { TemporalQueryConfiguration as TemporalQueryConfigurationValue } from "./env.ts";
import type { TemporalWorkflowsService } from "./temporal/queries.ts";

export const TemporalQueryConfiguration = defineResource<TemporalQueryConfigurationValue>()(
  "temporal-job/QueryConfiguration",
);
export const TemporalWorkflows = defineResource<TemporalWorkflowsService>()(
  "temporal-job/Workflows",
);
