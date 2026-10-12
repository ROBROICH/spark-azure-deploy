import { Documents } from "@spark-workflow/core/documents/resource";
import { Projects } from "@spark-workflow/core/projects/resource";
import { createNodeVersionService } from "@spark-workflow/node-crud";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { defineFeature, provide } from "@spark-workflow/resource";

import { plausibilitySchema } from "./db/schema.ts";
import { PlausibilityNodes, plausibilityNodesProvider } from "./nodes.ts";
import { processPlausibilityResults } from "./results.ts";
import {
  PlausibilityNotesVersioning,
  type PlausibilityNotesVersioningService,
} from "./resource.ts";
import { plausibilityNoteEntities } from "./v2-entities.ts";

const plausibilityVersioningProvider = provide({
  resource: PlausibilityNotesVersioning,
  needs: {
    postgres: PostgreSQL,
    projects: Projects,
    documents: Documents,
    nodes: PlausibilityNodes,
  },
  make: ({ postgres, projects, documents, nodes }) => {
    const scope = postgres.scope(plausibilitySchema);
    return Object.freeze<PlausibilityNotesVersioningService>({
      ...createNodeVersionService(nodes),
      sendResults: (projectId, fileId, projectVersion) =>
        processPlausibilityResults(
          scope,
          documents,
          projects,
          projectId,
          fileId,
          projectVersion,
        ),
    });
  },
});

export const feature = defineFeature({
  id: "plausibility-notes",
  needs: {
    projects: Projects,
    documents: Documents,
    plausibilityNotes: PlausibilityNotesVersioning,
    nodes: PlausibilityNodes,
    ...plausibilityNoteEntities.needs,
  },
  providers: [
    plausibilityNodesProvider,
    plausibilityVersioningProvider,
    ...plausibilityNoteEntities.providers,
  ],
  tables: plausibilitySchema,
});
