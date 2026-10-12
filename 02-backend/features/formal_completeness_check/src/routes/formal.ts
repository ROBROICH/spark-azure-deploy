import type { FeatureHttp } from "@spark-workflow/http-host";

import type { feature } from "../manifest.ts";
import { createDocumentRoutes } from "./documents.ts";
import { createRequirementRoutes } from "./requirements.ts";
import { createTemplateRoutes } from "./templates.ts";
import { createTocRoutes } from "./toc.ts";

export const createFormalRoutes = (http: FeatureHttp<typeof feature>) =>
  createTemplateRoutes(http)
    .use(createTocRoutes(http))
    .use(createRequirementRoutes(http))
    .use(createDocumentRoutes(http));
