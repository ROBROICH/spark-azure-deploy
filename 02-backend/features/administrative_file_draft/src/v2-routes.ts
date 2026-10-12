import type { FeatureHttp } from "@spark-workflow/http-host";
import { createNodeEntityResourceRoutes } from "@spark-workflow/node-crud";

import type { feature } from "./manifest.ts";
import { administrativeFileDraftEntities } from "./v2-entities.ts";

export const createV2Routes = (http: FeatureHttp<typeof feature>) =>
  createNodeEntityResourceRoutes(http, administrativeFileDraftEntities);
