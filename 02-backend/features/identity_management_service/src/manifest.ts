import { defineFeature } from "@spark-workflow/resource";

import { identityDatabaseSchema } from "./db/schema.ts";
import { Identity } from "./resource.ts";
import { identityProvider } from "./runtime.ts";

export const feature = defineFeature({
  id: "identity-management",
  needs: { identity: Identity },
  providers: [identityProvider],
  tables: identityDatabaseSchema,
});
