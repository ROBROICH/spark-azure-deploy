import { Projects } from "@spark-workflow/core/projects/resource";
import { bindNodeRuntime, defineNodeDescriptor, type NodeRuntime } from "@spark-workflow/node-crud";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { defineResource, provide } from "@spark-workflow/resource";

import { formalCompletenessSchema } from "../db/schema.ts";

export const formalCompletenessDescriptor = defineNodeDescriptor({
  name: "formal-completeness-check",
  auditLogEnabled: true,
  schema: formalCompletenessSchema,
  nodeMetadata: { tocNotes: { readonlyFields: ["generatedKey"] } },
});

export const FormalCompletenessNodes = defineResource<
  NodeRuntime<typeof formalCompletenessSchema>
>()("formal-completeness/Nodes");

export const formalCompletenessNodesProvider = provide({
  resource: FormalCompletenessNodes,
  needs: { postgres: PostgreSQL, projects: Projects },
  make: ({ postgres, projects }) =>
    bindNodeRuntime(formalCompletenessDescriptor, {
      persistence: postgres.scope(formalCompletenessSchema),
      versionPeer: projects,
    }),
});
