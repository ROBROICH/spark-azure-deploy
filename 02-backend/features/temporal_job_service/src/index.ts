import type { FeatureHttp } from "@spark-workflow/http-host";

import type { feature } from "./manifest.ts";
import { createLoadRoutes } from "./routes/load.ts";
import { createStatusRoutes } from "./routes/status.ts";
import { createWorkflowRoutes } from "./routes/workflows.ts";

export const createRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("temporal-job-service.feature")
    .use(createWorkflowRoutes(http))
    .use(createLoadRoutes(http))
    .use(createStatusRoutes(http));

export { feature } from "./manifest.ts";
export { createWorkflowStatusReporter } from "./tracking.ts";
export {
  parseTemporalJobWorkerConfiguration,
  parseTemporalQueryConfiguration,
  type TemporalJobWorkerConfiguration,
} from "./env.ts";
export { TemporalQueryConfiguration } from "./resource.ts";
