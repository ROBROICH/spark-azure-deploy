import type { FeatureHttp } from "@spark-workflow/http-host";

import type { feature } from "./manifest.ts";
import { createAssignmentRoutes } from "./routes/assignments.ts";
import { createIdentityRoutes } from "./routes/identity.ts";

export const createRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("identity-management.routes")
    .use(createIdentityRoutes(http))
    .use(createAssignmentRoutes(http));

export { feature } from "./manifest.ts";
export { parseIdentityEnvironment, type IdentityEnvironment } from "./env.ts";
export { Identity, IdentityConfiguration, type IdentityService } from "./resource.ts";
