import { DocumentFiles } from "@spark-workflow/core/documents/resource";
import { Projects } from "@spark-workflow/core/projects/resource";
import { defineFeature } from "@spark-workflow/resource";

import { supplementaryRequestsDatabaseSchema } from "./db/schema.ts";

export const feature = defineFeature({
  id: "supplementary-requests",
  needs: { projects: Projects, documents: DocumentFiles },
  providers: [],
  tables: supplementaryRequestsDatabaseSchema,
});
