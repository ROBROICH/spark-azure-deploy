import { SQL } from "bun";
import { createPostgresRuntime } from "@spark-workflow/postgres-runtime";
import { drizzle } from "drizzle-orm/bun-sql";

import type { NodeSchema } from "../../src";

export async function createNodeTestDatabase<Schema extends NodeSchema>(
  url: string,
  schema: Schema,
) {
  const client = new SQL(url, { max: 4, prepare: false });
  const database = drizzle({ client, schema });
  const persistence = createPostgresRuntime({ client, schema });
  try {
    await client.connect();
  } catch (error) {
    await client.close();
    throw error;
  }
  return {
    database,
    persistence,
    close: () => client.close(),
  };
}
