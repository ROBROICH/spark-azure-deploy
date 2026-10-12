import { createUpdateSchema } from "drizzle-typebox";

import { table } from "./schema.ts";
import { spread } from "./utils.ts";

export const db = {
  insert: {
    applicants: spread(table.applicants, "insert"),
    deadlines: spread(table.deadlines, "insert"),
    projects: spread(table.projects, "insert"),
    topics: spread(table.topics, "insert"),
  },
  select: {
    applicants: spread(table.applicants, "select"),
    deadlines: spread(table.deadlines, "select"),
    projects: spread(table.projects, "select"),
    topics: spread(table.topics, "select"),
  },
  update: {
    applicants: spread(createUpdateSchema(table.applicants)),
    deadlines: spread(createUpdateSchema(table.deadlines)),
    projects: spread(createUpdateSchema(table.projects)),
    topics: spread(createUpdateSchema(table.topics)),
  },
};
