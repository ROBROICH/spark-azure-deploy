import { Projects } from "@spark-workflow/core/projects/resource";
import { createNodeVersionService } from "@spark-workflow/node-crud";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { provide } from "@spark-workflow/resource";

import { objectionsSchema } from "./db/schema.ts";
import { bindObjectionsVersionRuntime, ObjectionsNodes } from "./node/descriptor.ts";
import { Objections, ObjectionsVersioning } from "./resource.ts";
import { createObjectionsService } from "./routes/ewms.ts";

export const objectionsProvider = provide({
  resource: Objections,
  needs: { postgres: PostgreSQL, projects: Projects },
  make: ({ postgres, projects }) =>
    createObjectionsService(postgres.scope(objectionsSchema), projects),
});

export const objectionsVersioningProvider = provide({
  resource: ObjectionsVersioning,
  needs: { nodes: ObjectionsNodes },
  make: ({ nodes }) => createNodeVersionService(bindObjectionsVersionRuntime(nodes)),
});
