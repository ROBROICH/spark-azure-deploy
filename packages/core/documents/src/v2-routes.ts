import type { FeatureHttp } from "@spark-workflow/http-host";

import type { coreFeature } from "../../src/manifest.ts";
import { createNodeEntityResourceRoutes, documentEntities } from "./v2-entities.ts";

export const createDocumentV2Routes = (http: FeatureHttp<typeof coreFeature>) =>
  createNodeEntityResourceRoutes(http, documentEntities);
