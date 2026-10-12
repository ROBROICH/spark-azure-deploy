import {
  createPostgresRuntime,
  type PostgresResourceRuntime,
} from "@spark-workflow/postgres-runtime";

import { commentDatabaseSchema } from "../../src/db/schema.ts";

export type CommentDatabaseRuntime = PostgresResourceRuntime<
  typeof commentDatabaseSchema
>;

export function createCommentDatabaseRuntime(
  url: string,
  schema: typeof commentDatabaseSchema = commentDatabaseSchema,
): CommentDatabaseRuntime {
  return createPostgresRuntime({
    url,
    schema,
    pool: {
      maxConnections: 3,
      idleTimeoutSeconds: 5,
      connectionTimeoutSeconds: 5,
      maxLifetimeSeconds: 60,
      closeTimeoutSeconds: 5,
    },
  });
}
