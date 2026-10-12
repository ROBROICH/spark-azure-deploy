import type { AuthPolicy } from "@spark-workflow/authentification";
import { resultOf, type FeatureHttp } from "@spark-workflow/http-host";
import { Result } from "better-result";

import { temporalJobErrors } from "../errors.ts";
import type { feature } from "../manifest.ts";
import { getSystemLoad } from "../temporal/queries.ts";
import { SystemLoadResponseSchema } from "../schemas.ts";

const loadPolicy = {
  roles: ["admin", "user", "service"],
} satisfies AuthPolicy;

export const createLoadRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("temporal-job-service.routes.load")
    .model({ GetSystemLoadResponse: SystemLoadResponseSchema })
    .get(
      "/temporal/load",
      async ({ temporalWorkflows, temporalQueryConfiguration }) => {
        return Result.tryPromise({
          try: () =>
            getSystemLoad(temporalWorkflows, {
              maxComplexity: temporalQueryConfiguration.maxSystemComplexity,
              workflowComplexity: temporalQueryConfiguration.workflowComplexity,
              defaultWorkflowComplexityWeight:
                temporalQueryConfiguration.defaultWorkflowComplexityWeight,
            }),
          catch: (cause) =>
            temporalJobErrors.SYSTEM_LOAD_FAILED({
              cause: cause instanceof Error ? cause : undefined,
            }),
        });
      },
      {
        response: resultOf(SystemLoadResponseSchema),
        auth: loadPolicy,
        temporalWorkflows: true,
        temporalQueryConfiguration: true,
        detail: { operationId: "getTemporalSystemLoad" },
      },
    );
