import { createSelectSchema } from "drizzle-typebox";

import { workflowExecutions } from "./schema.ts";

export const WorkflowExecutionRowSchema = createSelectSchema(
  workflowExecutions,
);
