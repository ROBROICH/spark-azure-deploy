import { Projects } from "@spark-workflow/core/projects/resource";
import { defineFeature } from "@spark-workflow/resource";

import { fppSchema } from "./db/schema.ts";
import { FppConfiguration } from "./env.ts";
import { FppDownloads, FppFiles } from "./resource.ts";
import { fppFilesProvider } from "./runtime.ts";

export const feature = defineFeature({
  id: "fpp",
  needs: {
    projects: Projects,
    configuration: FppConfiguration,
    fppDownloads: FppDownloads,
    fppFiles: FppFiles,
  },
  providers: [fppFilesProvider],
  tables: fppSchema,
});
