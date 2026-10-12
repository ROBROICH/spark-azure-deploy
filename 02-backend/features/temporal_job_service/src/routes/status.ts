import type { AuthPolicy } from "@spark-workflow/authentification";
import type { FeatureHttp } from "@spark-workflow/http-host";
import { t } from "elysia";

import type { feature } from "../manifest.ts";
import { StatusRequestSchema } from "../schemas.ts";
import { updateWorkflowStatus } from "../tracking.ts";

const servicePolicy = {
  roles: ["service"],
} satisfies AuthPolicy;

export const createStatusRoutes = (http: FeatureHttp<typeof feature>) =>
  http.controller("temporal-job-service.routes.status").post(
    "/internal/workflows/status",
    async ({ body, set, postgres }) => {
      await updateWorkflowStatus(postgres, body);
      set.status = 204;
      return null;
    },
    {
      body: StatusRequestSchema,
      response: { 204: t.Void() },
      auth: servicePolicy,
      detail: { operationId: "updateTemporalWorkflowStatus" },
    },
  );
