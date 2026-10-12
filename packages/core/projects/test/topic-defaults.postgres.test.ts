import { expect, expectTypeOf, test } from "bun:test";
import { SQL } from "bun";
import { TransactionRollbackError } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";

import { projectLogicSchema, projects, subtopics, topics } from "../src/db/schema.ts";

const databaseUrl = process.env.PLS_MUTATION_DATABASE_URL;

test("topic inserts require every visibility flag", () => {
  type Visibility = { showInMvp: boolean; showInEwm: boolean; showInBeschluss: boolean };
  expectTypeOf<Pick<typeof topics.$inferInsert, keyof Visibility>>().toEqualTypeOf<Visibility>();
  expectTypeOf<Pick<typeof subtopics.$inferInsert, keyof Visibility>>().toEqualTypeOf<Visibility>();
});

test.skipIf(!databaseUrl)(
  "topic and subtopic creation preserve explicit visibility choices",
  async () => {
    const client = new SQL(databaseUrl!);
    const database = drizzle({ client, schema: projectLogicSchema });
    const projectId = crypto.randomUUID();
    const topicId = crypto.randomUUID();
    const explicit = { showInMvp: false, showInEwm: false, showInBeschluss: false };
    try {
      await expect(
        database.transaction(async (transaction) => {
          await transaction
            .insert(projects)
            .values({ id: projectId, createdById: crypto.randomUUID() });
          const topicRows = await transaction
            .insert(topics)
            .values([
              {
                id: topicId,
                projectId,
                name: "Visible topic",
                showInMvp: true,
                showInEwm: true,
                showInBeschluss: true,
              },
              { id: crypto.randomUUID(), projectId, name: "Explicit topic", ...explicit },
            ])
            .returning({
              showInMvp: topics.showInMvp,
              showInEwm: topics.showInEwm,
              showInBeschluss: topics.showInBeschluss,
            });
          const subtopicRows = await transaction
            .insert(subtopics)
            .values([
              {
                id: crypto.randomUUID(),
                projectId,
                topicId,
                name: "Visible subtopic",
                showInMvp: true,
                showInEwm: true,
                showInBeschluss: true,
              },
              {
                id: crypto.randomUUID(),
                projectId,
                topicId,
                name: "Explicit subtopic",
                ...explicit,
              },
            ])
            .returning({
              showInMvp: subtopics.showInMvp,
              showInEwm: subtopics.showInEwm,
              showInBeschluss: subtopics.showInBeschluss,
            });

          for (const rows of [topicRows, subtopicRows]) {
            expect(rows).toEqual([
              { showInMvp: true, showInEwm: true, showInBeschluss: true },
              explicit,
            ]);
          }
          transaction.rollback();
        }),
      ).rejects.toBeInstanceOf(TransactionRollbackError);
    } finally {
      await client.close();
    }
  },
);
