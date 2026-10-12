import { defineFeature } from "@spark-workflow/resource";

import { commentDatabaseSchema } from "./db/schema.ts";

export const feature = defineFeature({
  id: "comment",
  needs: {},
  providers: [],
  tables: commentDatabaseSchema,
});
