import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createPostgresRuntime,
  type PostgresResourceRuntime,
  UnawaitedPostgresQueryError,
} from "@spark-workflow/postgres-runtime";
import {
  providePostgresTable,
  type PostgresTableResource,
} from "@spark-workflow/postgres-runtime/table-resource";
import { defineResource } from "@spark-workflow/resource";
import { sql } from "drizzle-orm";
import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

const widgets = pgTable("resource_widget", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  rank: integer("rank").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
});
const schema = { widgets };
type Widget = typeof widgets.$inferSelect;
type WidgetService = PostgresTableResource<
  typeof widgets,
  "id",
  "id" | "name" | "rank" | "createdAt" | "archivedAt"
>;

const Widgets = defineResource<WidgetService>()("test/PostgresWidgets");
const provider = providePostgresTable({
  resource: Widgets,
  table: widgets,
  identity: ["id"] as const,
  filterFields: ["id", "name", "rank", "createdAt", "archivedAt"] as const,
  schema,
});
const databaseUrl = process.env.POSTGRES_RUNTIME_TEST_URL;
const realPostgres = databaseUrl ? describe : describe.skip;

const widget = (id: string, name: string, rank: number): Widget => ({
  id,
  name,
  rank,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  archivedAt: null,
});

realPostgres("PostgreSQL table Resource semantics", () => {
  let runtime: PostgresResourceRuntime<typeof schema>;
  let service: WidgetService;

  beforeAll(() => {
    runtime = createPostgresRuntime({
      url: databaseUrl!,
      schema,
      pool: {
        maxConnections: 1,
        idleTimeoutSeconds: 5,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 60,
        closeTimeoutSeconds: 5,
      },
    });
    service = provider.make({ postgres: runtime });
  });

  afterAll(() => runtime.close());

  test("uses Better CRUD through the ambient transaction", async () => {
    await runtime.transact(async () => {
      await runtime.query((database) =>
        database.execute(sql`
          create temporary table resource_widget (
            id varchar primary key,
            name varchar not null,
            rank integer not null,
            created_at timestamptz not null,
            archived_at timestamptz
          ) on commit drop
        `),
      );

      await service.createMany({
        data: [widget("one", "Ada", 1), widget("two", "Grace", 2)],
      });
      expect(
        await service.update({ where: { id: "one" }, data: { name: "Ada Updated" } }),
      ).toMatchObject({
        id: "one",
        name: "Ada Updated",
      });
      expect(await service.findUnique({ where: { id: "two" } })).toMatchObject({
        id: "two",
        name: "Grace",
      });

      expect(
        await service.upsert({
          where: { id: "two" },
          create: widget("two", "unused", 0),
          update: { name: "Grace Upserted", rank: 3 },
        }),
      ).toMatchObject({ id: "two", name: "Grace Upserted", rank: 3 });

      expect(
        await service.findMany({
          where: {
            kind: "and",
            filters: [
              { kind: "gte", field: "rank", value: 1 },
              {
                kind: "not",
                filter: { kind: "eq", field: "name", value: "Grace Upserted" },
              },
              { kind: "absent", field: "archivedAt" },
            ],
          },
        }),
      ).toEqual([widget("one", "Ada Updated", 1)]);

      const upserted = await service.upsertMany({
        data: [widget("two", "Grace Updated", 4), widget("three", "Katherine", 5)],
        update: ["name", "rank"],
        batchSize: 1,
      });
      expect(upserted).toMatchObject({ count: 2 });
      expect(upserted.data).toHaveLength(2);
      expect(await service.count()).toBe(3);
      expect(await service.exists({ where: { kind: "eq", field: "rank", value: 5 } })).toBeTrue();

      expect(
        await service.updateEach({
          by: "id",
          data: [
            { id: "one", rank: 10 },
            { id: "two", rank: 20 },
          ],
          update: { rank: (row) => Number(row.rank) },
        }),
      ).toMatchObject({ count: 2 });
      expect(await service.paginate({ limit: 2, skip: 1 })).toMatchObject({
        data: expect.any(Array),
        pagination: { count: 3, hasNext: false, hasPrevious: true },
      });
      expect(
        await service.deleteMany({
          where: { kind: "in", field: "id", values: ["one", "two"] },
        }),
      ).toMatchObject({ count: 2 });
      expect(await service.findMany()).toEqual([widget("three", "Katherine", 5)]);
    });
  });

  test("drains unawaited writes before rolling back", async () => {
    await runtime.query((database) =>
      database.execute(sql`
        create temporary table resource_widget (
          id varchar primary key,
          name varchar not null,
          rank integer not null,
          created_at timestamptz not null,
          archived_at timestamptz
        ) on commit preserve rows
      `),
    );

    try {
      for (const callbackOutcome of ["return", "throw"] as const) {
        const id = crypto.randomUUID();
        const gate = Promise.withResolvers<void>();
        const callbackExited = Promise.withResolvers<void>();
        let write: Promise<void> | undefined;
        const transaction = runtime.transact(async () => {
          try {
            write = runtime.query(async (database) => {
              await gate.promise;
              await database.insert(widgets).values(widget(id, callbackOutcome, 1));
            });
            if (callbackOutcome === "throw") throw new Error("outer callback failed");
          } finally {
            callbackExited.resolve();
          }
        });

        await callbackExited.promise;
        await Bun.sleep(0);
        gate.resolve();
        let error: unknown;
        try {
          await transaction;
        } catch (cause) {
          error = cause;
        }
        await write;

        if (callbackOutcome === "throw") {
          expect(String(error)).toContain("outer callback failed");
        } else {
          expect(error).toBeInstanceOf(UnawaitedPostgresQueryError);
        }
        expect(await service.findUnique({ where: { id } })).toBeNull();
      }
    } finally {
      await runtime.query((database) => database.execute(sql`drop table resource_widget`));
    }
  });
});
