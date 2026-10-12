import type { FeatureHttp } from "@spark-workflow/http-host";

import type { feature } from "./manifest.ts";
import { createProjectRoutes } from "./routes/projects.ts";
import { createInternalRoutes } from "./routes/requests.ts";

export const createRoutes = (http: FeatureHttp<typeof feature>) =>
  createProjectRoutes(http).use(createInternalRoutes(http));

export { feature } from "./manifest.ts";
export { FppConfiguration, parseFppConfiguration } from "./env.ts";
export {
  FppDownloads,
  FppFiles,
  type FppDownloadsService,
  type FppFilesService,
} from "./resource.ts";
