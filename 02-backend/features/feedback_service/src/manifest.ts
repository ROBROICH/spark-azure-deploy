import { Projects } from "@spark-workflow/core/projects/resource";
import { defineFeature } from "@spark-workflow/resource";

import { feedbackSchema } from "./db/schema.ts";
import { FeedbackNodes, feedbackNodesProvider } from "./node.ts";
import { feedbackEntities } from "./v2-entities.ts";

export const feature = defineFeature({
  id: "feedback",
  needs: { projects: Projects, nodes: FeedbackNodes, ...feedbackEntities.needs },
  providers: [feedbackNodesProvider, ...feedbackEntities.providers],
  tables: feedbackSchema,
});
